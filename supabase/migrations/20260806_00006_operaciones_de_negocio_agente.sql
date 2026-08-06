-- ============================================================================
-- Migration: el agente IA puede ejecutar operaciones de negocio, no solo
-- escrituras de tabla
--
-- Motivo: el agente no podía cargar vacaciones. `propose_action` escribe filas,
-- y eso alcanza para un evento de calendario o una reunión, pero las vacaciones
-- son otra cosa:
--
--   * `vacaciones_dias` no tiene `empleado_id`. Cuelga de `vacaciones_id`, que
--     es la fila del año de esa persona, así que el agente —que razona en
--     empleado_id— no tenía forma de escribirla.
--   * Un período hay que repartirlo entre los meses que abarca.
--   * Los días se descuentan de `vacaciones.saldo_actual`.
--
-- Escribir la tabla a mano dejaba el saldo desincronizado sin ningún error
-- visible. Para eso ya existía `registrar_vacaciones()`, que es lo que usa el
-- dashboard; ahora el agente la usa también.
--
-- Se bloquea la escritura cruda de `vacaciones_dias` para que el camino
-- incorrecto no exista, en vez de confiar en que el modelo elija bien.
-- ============================================================================

-- ── ai_agent_log: registrar operaciones ──────────────────────────────────────
alter table ai_agent_log drop constraint if exists ai_agent_log_action_type_check;
alter table ai_agent_log add constraint ai_agent_log_action_type_check
  check (action_type in ('upsert', 'update', 'delete', 'operation'));

-- Para una operación, el "estado previo" no son filas: son los argumentos con
-- los que se la llamó. Deshacerla es invocar la operación inversa con esos
-- mismos valores (registrar_vacaciones ↔ revertir_vacaciones).
alter table ai_agent_log add column if not exists operation text;
alter table ai_agent_log add column if not exists operation_args jsonb;

-- ── Bloquear la escritura cruda de vacaciones_dias ───────────────────────────
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
    'notificaciones', 'puestos', 'eventos_calendario'
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

-- El backend del agente llama a estas dos directamente
grant execute on function registrar_vacaciones(bigint, date, date, integer) to service_role;
grant execute on function revertir_vacaciones(bigint, date, date, integer) to service_role;
