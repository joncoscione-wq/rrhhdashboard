-- ============================================================================
-- Migration: hacer que un empleado duplicado sea imposible
--
-- Hasta acá lo único que evitaba duplicados era `resolveEmpleadoId()` en el
-- importador: un matcher por nombre, best-effort, que ya falló una vez y dejó
-- 13 empleados repetidos. Una defensa en código no alcanza cuando hay varios
-- caminos de escritura (importador, formulario del legajo, agente IA).
--
-- Este índice mueve la garantía a la base: no importa qué código escriba, dos
-- filas con el mismo nombre no pueden coexistir.
--
-- Contrapartida aceptada: si algún día entran dos empleados que realmente se
-- llaman igual, el insert va a fallar y habrá que desambiguar a mano (por
-- ejemplo agregando el segundo nombre). Con la plantilla actual el riesgo de
-- duplicar por error es mucho mayor que el de una homonimia real.
-- ============================================================================

-- Normaliza un nombre para comparar identidades: sin acentos, sin puntuación,
-- en minúscula y con las palabras ordenadas alfabéticamente. Así
-- "URRUTIA, Barbara" y "Barbara Urrutia" producen la misma clave.
create or replace function nombre_normalizado(p text)
returns text
language sql
immutable
strict
as $$
  select string_agg(t, ' ' order by t)
    from unnest(string_to_array(
      regexp_replace(
        lower(translate(p,
          'áéíóúÁÉÍÓÚñÑüÜàèìòùâêîôûäëïöçÇ',
          'aeiouAEIOUnNuUaeiouaeiouaeiocC')),
        '[^a-z0-9 ]', ' ', 'g'),
      ' ')) t
   where t <> '';
$$;

create unique index if not exists empleados_nombre_normalizado_key
  on empleados (empresa_id, nombre_normalizado(nombre_apellido));
