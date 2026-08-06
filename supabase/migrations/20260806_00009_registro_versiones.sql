-- Sistema de Versionado e Historial Cronológico.
-- Cada UPDATE/INSERT/DELETE en una entidad genera una nueva versión con
-- snapshot completo + diff respecto de la versión anterior.

create table if not exists registro_versiones (
  id uuid default gen_random_uuid() primary key,
  entidad_tabla text not null,
  entidad_id bigint not null,
  version integer not null,
  snapshot jsonb not null,
  cambios jsonb not null,
  usuario text not null,
  operacion text not null check (operacion in ('creacion', 'actualizacion', 'eliminacion', 'restauracion')),
  created_at timestamptz not null default now(),
  unique(entidad_tabla, entidad_id, version)
);

alter table registro_versiones enable row level security;
-- Solo lectura: los inserts los hace el trigger, que corre como security definer
-- y por lo tanto no pasa por RLS. Nadie debe poder editar ni borrar el historial.
create policy registro_versiones_select on registro_versiones for select using (true);

create index idx_versiones_entidad on registro_versiones(entidad_tabla, entidad_id, version desc);

-- Función que captura el snapshot actual y el diff contra la versión anterior.
-- Se dispara AFTER INSERT OR UPDATE OR DELETE en cada tabla monitoreada.
create or replace function capturar_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entidad_id bigint;
  v_prox_version integer;
  v_snapshot jsonb;
  v_cambios jsonb := '{}'::jsonb;
  v_usuario text;
  v_operacion text;
  v_old jsonb;
begin
  -- Determinar usuario del contexto. Si existe la variable de sesión
  -- 'request.jwt.claims' la usamos; sino 'Asistente IA' o 'Sistema'.
  begin
    v_usuario := coalesce(
      current_setting('app.current_user', true),
      current_setting('request.jwt.claims', true)::jsonb->>'email',
      'Sistema'
    );
  exception when others then
    v_usuario := 'Sistema';
  end;

  if tg_op = 'DELETE' then
    v_entidad_id := old.id;
    v_operacion := 'eliminacion';
    v_snapshot := to_jsonb(old);
  elsif tg_op = 'INSERT' then
    v_entidad_id := new.id;
    v_operacion := 'creacion';
    v_snapshot := to_jsonb(new);
  else -- UPDATE
    v_entidad_id := new.id;
    v_operacion := 'actualizacion';
    v_old := to_jsonb(old);
    v_snapshot := to_jsonb(new);

    -- Calcular diff: comparar old vs new columna por columna
    select coalesce(
             jsonb_object_agg(k, jsonb_build_object('anterior', v_old->k, 'nuevo', v_snapshot->k)),
             '{}'::jsonb
           )
      into v_cambios
      from jsonb_object_keys(v_old || v_snapshot) as k
     where v_old->k is distinct from v_snapshot->k;
  end if;

  -- Siguiente número de versión para esta entidad
  select coalesce(max(version), 0) + 1
    into v_prox_version
    from registro_versiones
   where entidad_tabla = tg_table_name
     and entidad_id = v_entidad_id;

  insert into registro_versiones (entidad_tabla, entidad_id, version, snapshot, cambios, usuario, operacion)
  values (tg_table_name, v_entidad_id, v_prox_version, v_snapshot, v_cambios, v_usuario, v_operacion);

  return null;
end;
$$;

-- Asociar el trigger a todas las tablas principales del sistema.
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'empleados', 'sueldos', 'vacaciones', 'lineas_moviles',
      'flota_laptops', 'reuniones', 'manuales', 'eventos_calendario',
      'puestos', 'home_office_semanal'
    ])
  loop
    execute format(
      'drop trigger if exists version_%I on %I;
       create trigger version_%I
         after insert or update or delete on %I
         for each row execute function capturar_version()',
      t, t, t, t
    );
  end loop;
end;
$$;

-- RPC para restaurar una versión. Captura el snapshot, lo vuelca a la tabla
-- real y registra la restauración como una nueva versión.
create or replace function restaurar_version(
  p_entidad_tabla text,
  p_entidad_id bigint,
  p_version integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot jsonb;
  v_campos jsonb;
  v_colname text;
  v_colval jsonb;
  v_set_parts text[] := '{}';
  v_usuario text;
  v_prox_version integer;
begin
  select snapshot into v_snapshot
    from registro_versiones
   where entidad_tabla = p_entidad_tabla
     and entidad_id = p_entidad_id
     and version = p_version;

  if v_snapshot is null then
    raise exception 'Versión % no encontrada para % id %', p_version, p_entidad_tabla, p_entidad_id;
  end if;

  begin
    v_usuario := coalesce(
      current_setting('app.current_user', true),
      current_setting('request.jwt.claims', true)::jsonb->>'email',
      'Sistema'
    );
  exception when others then
    v_usuario := 'Sistema';
  end;

  -- Construir SET clause dinámica a partir del snapshot (excluyendo id).
  -- Ojo: hay que pasar el valor como texto (->>) y no como jsonb, porque %L
  -- sobre un jsonb genera literales rotos ('"Juan"' con comillas adentro) y
  -- convierte el null de JSON en el string 'null' en vez de NULL.
  for v_colname, v_colval in
    select key, value from jsonb_each(v_snapshot)
     where key not in ('id', 'created_at', 'updated_at')
  loop
    v_set_parts := v_set_parts || format(
      '%I = %L',
      v_colname,
      case when jsonb_typeof(v_colval) = 'null' then null else v_snapshot->>v_colname end
    );
  end loop;

  if array_length(v_set_parts, 1) > 0 then
    execute format(
      'update %I set %s where id = $1',
      p_entidad_tabla,
      array_to_string(v_set_parts, ', ')
    ) using p_entidad_id;
  end if;

  -- Siguiente versión
  select coalesce(max(version), 0) + 1
    into v_prox_version
    from registro_versiones
   where entidad_tabla = p_entidad_tabla
     and entidad_id = p_entidad_id;

  insert into registro_versiones (entidad_tabla, entidad_id, version, snapshot, cambios, usuario, operacion)
  values (
    p_entidad_tabla,
    p_entidad_id,
    v_prox_version,
    v_snapshot,
    jsonb_build_object('accion', format('restaurado_desde_version_%s', p_version)),
    v_usuario,
    'restauracion'
  );

  return jsonb_build_object('ok', true, 'nueva_version', v_prox_version);
end;
$$;

revoke all on function restaurar_version(text, bigint, integer) from public, anon, authenticated;
grant execute on function restaurar_version(text, bigint, integer) to service_role;
