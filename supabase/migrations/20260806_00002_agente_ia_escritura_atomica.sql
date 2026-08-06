-- ============================================================================
-- Migration: escritura atómica y reversible para el agente IA
--
-- Tres cosas:
--   1. Arregla la clave única de `sueldos`, que no contemplaba `moneda` y por
--      eso hacía que cada sync pisara el sueldo de la otra moneda del mismo mes.
--   2. Agrega a `ai_agent_log` las columnas para marcar acciones revertidas.
--   3. Crea `ai_execute_action`, que hace toda la escritura en UNA sentencia
--      por acción (antes era un for en TypeScript fila por fila: si fallaba en
--      la mitad quedaba a medio escribir y sin rollback).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. sueldos: la moneda es parte de la identidad de la fila
-- ----------------------------------------------------------------------------
-- Un empleado puede cobrar en PESOS ARG y en USD el mismo mes. La constraint
-- vieja (empleado_id, mes, anio) hacía que el upsert de una moneda reemplazara
-- el de la otra, y el dato desaparecía sin error.
alter table sueldos drop constraint if exists sueldos_empleado_id_mes_anio_key;
alter table sueldos drop constraint if exists sueldos_empleado_id_mes_anio_moneda_key;
alter table sueldos
  add constraint sueldos_empleado_id_mes_anio_moneda_key
  unique (empleado_id, mes, anio, moneda);

-- ----------------------------------------------------------------------------
-- 2. ai_agent_log: soporte de deshacer
-- ----------------------------------------------------------------------------
alter table ai_agent_log add column if not exists reverted_at timestamptz;
alter table ai_agent_log add column if not exists revert_of bigint references ai_agent_log (id);

create index if not exists ai_agent_log_revert_of_idx on ai_agent_log (revert_of);

-- ----------------------------------------------------------------------------
-- 3. ai_execute_action — escritura atómica con allowlist
-- ----------------------------------------------------------------------------
-- Devuelve { affected, before, after }. `before` es el estado previo de las
-- filas tocadas, que es lo que después permite revertir la acción.
--
-- p_key_column acepta clave compuesta separada por comas ('empleado_id,mes,anio'),
-- que es lo que necesitan sueldos, vacaciones, home_office_semanal y eventos.
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
    'empleados', 'sueldos', 'vacaciones', 'vacaciones_dias', 'lineas_moviles',
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
  if not (p_table = any (v_allowed)) then
    raise exception 'Tabla no permitida: %', p_table;
  end if;

  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 then
    raise exception 'records debe ser un array no vacío';
  end if;

  -- Columnas presentes en los registros propuestos
  select array_agg(distinct k order by k) into v_data_cols
    from jsonb_array_elements(p_records) r, jsonb_object_keys(r) k;

  -- Validación contra el catálogo: si el modelo inventó un nombre de columna,
  -- cortamos acá con un mensaje claro en vez de dejar que Postgres tire un
  -- error críptico a mitad de la sentencia dinámica.
  select c into v_invalid
    from unnest(v_data_cols) c
   where c not in (
     select column_name from information_schema.columns
      where table_schema = 'public' and table_name = p_table
   )
   limit 1;
  if v_invalid is not null then
    raise exception 'La columna "%" no existe en la tabla %', v_invalid, p_table;
  end if;

  select array_agg(trim(x)) into v_key_cols
    from unnest(string_to_array(p_key_column, ',')) x
   where trim(x) <> '';
  if v_key_cols is null then
    raise exception 'Se requiere al menos una columna clave';
  end if;

  select c into v_invalid
    from unnest(v_key_cols) c
   where c not in (
     select column_name from information_schema.columns
      where table_schema = 'public' and table_name = p_table
   )
   limit 1;
  if v_invalid is not null then
    raise exception 'La columna clave "%" no existe en la tabla %', v_invalid, p_table;
  end if;

  -- ¿Los registros traen la clave? Si no la traen, no hay con qué matchear una
  -- fila existente: es un alta pura. Pasa en tablas sin clave natural
  -- (manuales, flota_laptops, reuniones), donde el id lo genera Postgres.
  select c into v_invalid
    from unnest(v_key_cols) c
   where not (c = any (v_data_cols))
   limit 1;
  v_es_alta_pura := v_invalid is not null;

  if v_es_alta_pura and p_action_type <> 'upsert' then
    raise exception 'Los registros no traen la columna clave "%", necesaria para %',
      v_invalid, p_action_type;
  end if;

  if not v_es_alta_pura then
    select string_agg(format('t.%I = s.%I', c, c), ' and ') into v_join_cond
      from unnest(v_key_cols) c;

    -- Estado previo de las filas que van a ser tocadas (base del undo)
    v_sql := format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb)
         from %I t join jsonb_populate_recordset(null::%I, $1) s on %s',
      p_table, p_table, v_join_cond
    );
    execute v_sql into v_before using p_records;
  end if;

  if v_es_alta_pura then
    -- Alta sin clave: insert directo, sin on conflict. `before` queda vacío y
    -- el undo se resuelve dando de baja las filas nuevas.
    select string_agg(format('%I', c), ', ') into v_col_list from unnest(v_data_cols) c;
    v_sql := format(
      'with w as (
         insert into %I (%s)
         select %s from jsonb_populate_recordset(null::%I, $1)
         returning to_jsonb(%I) as fila
       ) select coalesce(jsonb_agg(fila), ''[]''::jsonb) from w',
      p_table, v_col_list, v_col_list, p_table, p_table
    );
    execute v_sql into v_after using p_records;

  elsif p_action_type = 'upsert' then
    select string_agg(format('%I', c), ', ') into v_col_list from unnest(v_data_cols) c;
    select string_agg(format('%I', c), ', ') into v_conflict_cols from unnest(v_key_cols) c;

    -- Las PK son `generated always as identity`: para poder upsertear por id
    -- explícito hay que pedir override, pero solo si el id viene en los datos.
    if 'id' = any (v_data_cols) then
      v_overriding := 'overriding system value';
    end if;

    select string_agg(format('%I = excluded.%I', c, c), ', ') into v_set_clause
      from unnest(v_data_cols) c
     where not (c = any (v_key_cols));

    if v_set_clause is null then
      -- Solo vinieron las columnas clave: no hay nada que actualizar
      v_sql := format(
        'with w as (
           insert into %I (%s) %s
           select %s from jsonb_populate_recordset(null::%I, $1)
           on conflict (%s) do nothing
           returning to_jsonb(%I) as fila
         ) select coalesce(jsonb_agg(fila), ''[]''::jsonb) from w',
        p_table, v_col_list, v_overriding, v_col_list, p_table, v_conflict_cols, p_table
      );
    else
      v_sql := format(
        'with w as (
           insert into %I (%s) %s
           select %s from jsonb_populate_recordset(null::%I, $1)
           on conflict (%s) do update set %s
           returning to_jsonb(%I) as fila
         ) select coalesce(jsonb_agg(fila), ''[]''::jsonb) from w',
        p_table, v_col_list, v_overriding, v_col_list, p_table,
        v_conflict_cols, v_set_clause, p_table
      );
    end if;
    execute v_sql into v_after using p_records;

  elsif p_action_type = 'update' then
    select string_agg(format('%I = s.%I', c, c), ', ') into v_set_clause
      from unnest(v_data_cols) c
     where not (c = any (v_key_cols));
    if v_set_clause is null then
      raise exception 'No hay columnas para actualizar (solo vinieron las claves)';
    end if;

    v_sql := format(
      'with w as (
         update %I t set %s
           from jsonb_populate_recordset(null::%I, $1) s
          where %s
         returning to_jsonb(t) as fila
       ) select coalesce(jsonb_agg(fila), ''[]''::jsonb) from w',
      p_table, v_set_clause, p_table, v_join_cond
    );
    execute v_sql into v_after using p_records;

  elsif p_action_type = 'delete' then
    if p_table = 'empleados' then
      -- Nunca se borra un empleado físicamente: arrastra sueldos, vacaciones,
      -- flota y legajo por FK. Baja lógica.
      v_sql := format(
        'with w as (
           update %I t set activo = false
             from jsonb_populate_recordset(null::%I, $1) s
            where %s
           returning to_jsonb(t) as fila
         ) select coalesce(jsonb_agg(fila), ''[]''::jsonb) from w',
        p_table, p_table, v_join_cond
      );
    else
      v_sql := format(
        'with w as (
           delete from %I t
             using jsonb_populate_recordset(null::%I, $1) s
            where %s
           returning to_jsonb(t) as fila
         ) select coalesce(jsonb_agg(fila), ''[]''::jsonb) from w',
        p_table, p_table, v_join_cond
      );
    end if;
    execute v_sql into v_after using p_records;

  else
    raise exception 'Tipo de acción no soportado: %', p_action_type;
  end if;

  return jsonb_build_object(
    'affected', jsonb_array_length(v_after),
    'before', v_before,
    'after', v_after
  );
end;
$$;

-- Solo el backend (service role) puede ejecutarla. El browser usa anon y no
-- debe poder escribir tablas arbitrarias saltándose la confirmación del usuario.
revoke all on function ai_execute_action(text, text, jsonb, text) from public, anon, authenticated;
grant execute on function ai_execute_action(text, text, jsonb, text) to service_role;
