-- ============================================================================
-- Migration: ai_schema_rules — el agente IA lee las reglas reales del esquema
--
-- Motivo: el agente propuso un evento con tipo 'cumpleaños' en
-- eventos_calendario, que solo acepta estudio/mudanza/ausencia. Al no poder,
-- fabricó una 'ausencia' falsa con descripción "Cumpleaños de X" — un dato
-- inventado que además cae en el calendario como si la persona faltara.
--
-- La causa era que los valores permitidos no estaban en ningún lado del prompt,
-- así que el modelo adivinaba. Esta función se los da leídos de Postgres, así
-- nunca quedan desactualizados respecto del esquema real.
--
-- Hay inconsistencias que esto expone y que el agente necesita ver:
--   empleados.modalidad          → 'presencial' | 'home_office' | 'hibrido' | 'n/a'
--   home_office_semanal.modalidad→ 'Presencial' | 'Remoto'   (¡otra capitalización!)
-- ============================================================================

create or replace function ai_schema_rules()
returns table (tabla text, tipo_regla text, detalle text)
language sql
stable
security definer
set search_path = public
as $$
  -- Valores permitidos por check constraint
  select c.relname::text,
         'check'::text,
         pg_get_constraintdef(con.oid)::text
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and con.contype = 'c'
     and c.relname = any (array[
       'empleados','sueldos','vacaciones','vacaciones_dias','lineas_moviles',
       'flota_laptops','home_office_semanal','reuniones','manuales',
       'notificaciones','puestos','eventos_calendario'
     ])

  union all

  -- Columnas obligatorias sin default: si faltan, el insert falla
  select c.relname::text,
         'obligatoria'::text,
         a.attname::text
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and a.attnum > 0
     and not a.attisdropped
     and a.attnotnull
     and not exists (
       select 1 from pg_attrdef d where d.adrelid = c.oid and d.adnum = a.attnum
     )
     and a.attidentity = ''
     and c.relname = any (array[
       'empleados','sueldos','vacaciones','vacaciones_dias','lineas_moviles',
       'flota_laptops','home_office_semanal','reuniones','manuales',
       'notificaciones','puestos','eventos_calendario'
     ])
  order by 1, 2, 3;
$$;

grant execute on function ai_schema_rules() to anon, authenticated, service_role;
