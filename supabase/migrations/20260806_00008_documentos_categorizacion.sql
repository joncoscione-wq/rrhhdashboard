-- ============================================================================
-- Migration: Documentos — categorización por etiquetas, asociación a flota
--            y acceso del agente IA
--
-- Contexto: rediseño del dashboard de RRHH:
--   * La sección "Expedientes" pasa a ser "Documentos".
--   * Los documentos ahora se asocian a empleados, líneas móviles o laptops.
--   * Se agrega categorización por etiqueta.
--   * El agente IA puede leer y escribir documentos_empleados.
-- ============================================================================

-- ── 1. documentos_empleados: nuevas columnas y constraints ───────────────────

alter table documentos_empleados
  alter column empleado_id drop not null;

alter table documentos_empleados
  add column if not exists linea_movil_id bigint
    references lineas_moviles(id) on delete set null;

alter table documentos_empleados
  add column if not exists laptop_id bigint
    references flota_laptops(id) on delete set null;

alter table documentos_empleados
  add column if not exists etiqueta text;

alter table documentos_empleados
  add constraint documentos_empleados_etiqueta_check
    check (etiqueta is null or etiqueta in ('Legal', 'Contable', 'RRHH', 'Contrato', 'Seguro'));

alter table documentos_empleados
  add constraint documentos_empleados_asociacion_check
    check (
      empleado_id is not null
      or linea_movil_id is not null
      or laptop_id is not null
    );

create index if not exists idx_documentos_linea_movil
  on documentos_empleados(linea_movil_id);

create index if not exists idx_documentos_laptop
  on documentos_empleados(laptop_id);

-- ── 2. ai_execute_action: agregar documentos_empleados a la allowlist ────────
--    (mismo cuerpo que 20260806_00006, solo cambia v_allowed)

create or replace function ai_execute_action(
  p_action_type text,
  p_table text,
  p_records jsonb,
  p_key_column text default 'id'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed constant text[] := array[
    'empleados', 'sueldos', 'vacaciones', 'lineas_moviles',
    'flota_laptops', 'home_office_semanal', 'reuniones', 'manuales',
    'notificaciones', 'puestos', 'eventos_calendario', 'documentos_empleados'
  ];
  v_key_cols text[];
  v_data_cols text[];
  v_invalid text;
  v_col_list text;
  v_set_clause text;
  v_join_cond text;
  v_conflict_cols text;
  v_overriding text := '';
  v_es_alta_pura boolean := false;
  v_before jsonb := '[]'::jsonb;
  v_after jsonb := '[]'::jsonb;
  v_sql text;
begin
  if p_table = 'vacaciones_dias' then
    raise exception 'vacaciones_dias no se escribe directo: usá la operación registrar_vacaciones, que reparte los días por mes y ajusta el saldo';
  end if;

  if not (p_table = any (v_allowed)) then
    raise exception 'Tabla no permitida: %', p_table;
  end if;

  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 then
    raise exception 'records debe ser un array no vacío';
  end if;

  select array_agg(distinct k order by k) into v_data_cols
    from jsonb_array_elements(p_records) r, jsonb_object_keys(r) k;

  select c into v_invalid
    from unnest(v_data_cols) c
   where c not in (select column_name from information_schema.columns
                    where table_schema = 'public' and table_name = p_table)
   limit 1;
  if v_invalid is not null then
    raise exception 'La columna "%" no existe en la tabla %', v_invalid, p_table;
  end if;

  select array_agg(trim(x)) into v_key_cols
    from unnest(string_to_array(p_key_column, ',')) x where trim(x) <> '';
  if v_key_cols is null then
    raise exception 'Se requiere al menos una columna clave';
  end if;

  select c into v_invalid
    from unnest(v_key_cols) c
   where c not in (select column_name from information_schema.columns
                    where table_schema = 'public' and table_name = p_table)
   limit 1;
  if v_invalid is not null then
    raise exception 'La columna clave "%" no existe en la tabla %', v_invalid, p_table;
  end if;

  select c into v_invalid
    from unnest(v_key_cols) c where not (c = any (v_data_cols)) limit 1;
  v_es_alta_pura := v_invalid is not null;

  if v_es_alta_pura and p_action_type <> 'upsert' then
    raise exception 'Los registros no traen la columna clave "%", necesaria para %',
      v_invalid, p_action_type;
  end if;

  if not v_es_alta_pura then
    select string_agg(format('t.%I = s.%I', c, c), ' and ') into v_join_cond
      from unnest(v_key_cols) c;
    v_sql := format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb)
         from %I t join jsonb_populate_recordset(null::%I, $1) s on %s',
      p_table, p_table, v_join_cond);
    execute v_sql into v_before using p_records;
  end if;

  if v_es_alta_pura then
    select string_agg(format('%I', c), ', ') into v_col_list from unnest(v_data_cols) c;
    v_sql := format(
      'with w as (insert into %I (%s) select %s from jsonb_populate_recordset(null::%I, $1)
         returning to_jsonb(%I) as fila)
       select coalesce(jsonb_agg(fila), ''[]''::jsonb) from w',
      p_table, v_col_list, v_col_list, p_table, p_table);
    execute v_sql into v_after using p_records;

  elsif p_action_type = 'upsert' then
    select string_agg(format('%I', c), ', ') into v_col_list from unnest(v_data_cols) c;
    select string_agg(format('%I', c), ', ') into v_conflict_cols from unnest(v_key_cols) c;
    if 'id' = any (v_data_cols) then v_overriding := 'overriding system value'; end if;
    select string_agg(format('%I = excluded.%I', c, c), ', ') into v_set_clause
      from unnest(v_data_cols) c where not (c = any (v_key_cols));

    if v_set_clause is null then
      v_sql := format(
        'with w as (insert into %I (%s) %s select %s from jsonb_populate_recordset(null::%I, $1)
           on conflict (%s) do nothing returning to_jsonb(%I) as fila)
         select coalesce(jsonb_agg(fila), ''[]''::jsonb) from w',
        p_table, v_col_list, v_overriding, v_col_list, p_table, v_conflict_cols, p_table);
    else
      v_sql := format(
        'with w as (insert into %I (%s) %s select %s from jsonb_populate_recordset(null::%I, $1)
           on conflict (%s) do update set %s returning to_jsonb(%I) as fila)
         select coalesce(jsonb_agg(fila), ''[]''::jsonb) from w',
        p_table, v_col_list, v_overriding, v_col_list, p_table,
        v_conflict_cols, v_set_clause, p_table);
    end if;
    execute v_sql into v_after using p_records;

  elsif p_action_type = 'update' then
    select string_agg(format('%I = s.%I', c, c), ', ') into v_set_clause
      from unnest(v_data_cols) c where not (c = any (v_key_cols));
    if v_set_clause is null then
      raise exception 'No hay columnas para actualizar (solo vinieron las claves)';
    end if;
    v_sql := format(
      'with w as (update %I t set %s from jsonb_populate_recordset(null::%I, $1) s
         where %s returning to_jsonb(t) as fila)
       select coalesce(jsonb_agg(fila), ''[]''::jsonb) from w',
      p_table, v_set_clause, p_table, v_join_cond);
    execute v_sql into v_after using p_records;

  elsif p_action_type = 'delete' then
    if p_table = 'empleados' then
      v_sql := format(
        'with w as (update %I t set activo = false
           from jsonb_populate_recordset(null::%I, $1) s where %s
           returning to_jsonb(t) as fila)
         select coalesce(jsonb_agg(fila), ''[]''::jsonb) from w',
        p_table, p_table, v_join_cond);
    else
      v_sql := format(
        'with w as (delete from %I t using jsonb_populate_recordset(null::%I, $1) s
           where %s returning to_jsonb(t) as fila)
         select coalesce(jsonb_agg(fila), ''[]''::jsonb) from w',
        p_table, p_table, v_join_cond);
    end if;
    execute v_sql into v_after using p_records;

  else
    raise exception 'Tipo de acción no soportado: %', p_action_type;
  end if;

  return jsonb_build_object('affected', jsonb_array_length(v_after),
                            'before', v_before, 'after', v_after);
end;
$$;

revoke all on function ai_execute_action(text, text, jsonb, text) from public, anon, authenticated;
grant execute on function ai_execute_action(text, text, jsonb, text) to service_role;
