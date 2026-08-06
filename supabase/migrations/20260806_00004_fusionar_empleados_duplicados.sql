-- ============================================================================
-- Migration: fusionar los 13 empleados duplicados y limpiar filas que no lo son
--
-- Qué pasó: una importación tomó la LISTA DE CASILLAS DE CORREO y la cargó como
-- si fuera el legajo. Eso metió 33 filas nuevas en `empleados`, de las cuales:
--
--   * 13 eran duplicados de gente que ya existía, con otro formato de nombre
--     ("Barbara Urrutia" vs "URRUTIA, Barbara"). Dos de ellos estaban escondidos
--     detrás de typos: "Brain Strano" (Brian) y "Nilocas Reinero" (Nicolas).
--   * 3 no eran personas: una regla de reenvío ("Fowar a contable@contexto"),
--     un alias ("Jonco" → comercial@) y un buzón compartido
--     ("Pablo Elihalt y Elizabet Acuña" → clientes@).
--   * 19 traían el email como "mailto:x@y.com", porque la celda del sheet era un
--     hipervínculo y se scrapeó el href en vez del texto. Ese prefijo además
--     enmascaraba duplicados: dos filas con el mismo mail no chocaban contra
--     la constraint única porque una lo tenía con prefijo y la otra sin.
--
-- Dirección de la fusión: los ids VIEJOS son los canónicos. Tienen todos los
-- datos reales (134 sueldos, 20 home office, 17 vacaciones, 8 puestos); los
-- duplicados no tenían prácticamente nada.
--
-- Decisiones tomadas con el usuario:
--   * `activo` NO se pisa con el valor del duplicado. Cuatro personas figuran
--     inactivas en el registro viejo y activas en el nuevo; dar de baja a
--     alguien es una acción deliberada de RRHH, y que la casilla de correo siga
--     existiendo no significa que la persona siga trabajando.
--   * Los sueldos que chocan no se resuelven automáticamente: se registran en
--     `merge_sueldos_conflicto` para revisión manual.
-- ============================================================================

create table if not exists merge_sueldos_conflicto (
  id bigint primary key generated always as identity,
  empleado_id bigint references empleados (id) on delete cascade,
  nombre_apellido text,
  mes int,
  anio int,
  moneda text,
  monto_conservado numeric,
  monto_descartado numeric,
  bono_conservado numeric,
  bono_descartado numeric,
  revisado boolean not null default false,
  created_at timestamptz not null default now()
);

alter table merge_sueldos_conflicto enable row level security;
drop policy if exists merge_sueldos_conflicto_rw on merge_sueldos_conflicto;
create policy merge_sueldos_conflicto_rw on merge_sueldos_conflicto
  for all to anon, authenticated using (true) with check (true);

create temp table pares (viejo bigint, nuevo bigint) on commit drop;
insert into pares values
  (1, 917), (2, 907), (4, 920), (6, 913), (7, 918), (9, 919), (11, 922),
  (13, 891), (14, 915), (15, 899), (16, 888), (17, 909), (887, 910);

-- Sueldos que existen en ambos lados con distinto monto: se conserva el del
-- canónico y se deja registrado el descartado.
insert into merge_sueldos_conflicto
  (empleado_id, nombre_apellido, mes, anio, moneda,
   monto_conservado, monto_descartado, bono_conservado, bono_descartado)
select p.viejo, e.nombre_apellido, s.mes, s.anio, s.moneda,
       v.monto, s.monto, v.bono_anual, s.bono_anual
  from sueldos s
  join pares p on s.empleado_id = p.nuevo
  join sueldos v
    on v.empleado_id = p.viejo and v.mes = s.mes and v.anio = s.anio and v.moneda = s.moneda
  join empleados e on e.id = p.viejo;

-- Mudar al canónico todo lo que no colisione
update sueldos s set empleado_id = p.viejo
  from pares p
 where s.empleado_id = p.nuevo
   and not exists (
     select 1 from sueldos v where v.empleado_id = p.viejo
       and v.mes = s.mes and v.anio = s.anio and v.moneda = s.moneda);

update vacaciones t set empleado_id = p.viejo from pares p
 where t.empleado_id = p.nuevo
   and not exists (select 1 from vacaciones v where v.empleado_id = p.viejo and v.anio = t.anio);

update puestos t set empleado_id = p.viejo from pares p
 where t.empleado_id = p.nuevo
   and not exists (select 1 from puestos v where v.empleado_id = p.viejo);

update home_office_semanal t set empleado_id = p.viejo from pares p
 where t.empleado_id = p.nuevo
   and not exists (
     select 1 from home_office_semanal v where v.empleado_id = p.viejo
       and v.dia_semana = t.dia_semana and v.fecha_desde is not distinct from t.fecha_desde);

update eventos_calendario t set empleado_id = p.viejo from pares p
 where t.empleado_id = p.nuevo
   and not exists (
     select 1 from eventos_calendario v where v.empleado_id = p.viejo
       and v.tipo = t.tipo and v.fecha = t.fecha);

update flota_laptops t set empleado_id = p.viejo from pares p where t.empleado_id = p.nuevo;
update lineas_moviles t set empleado_id = p.viejo from pares p where t.empleado_id = p.nuevo;
update documentos_empleados t set empleado_id = p.viejo from pares p where t.empleado_id = p.nuevo;

-- Guardar los campos del duplicado antes de borrarlo: el email hay que
-- rescatarlo porque en varios casos solo lo tenía el registro nuevo.
create temp table aporte on commit drop as
select p.viejo,
       nullif(trim(regexp_replace(coalesce(n.email, ''), '^mailto:', '', 'i')), '') as email,
       n.dni, n.celular, n.contacto_emergencia, n.equipo_ingreso,
       n.fecha_ingreso, n.fecha_nacimiento, n.direccion, n.movilidad, n.modalidad
  from pares p join empleados n on n.id = p.nuevo;

delete from sueldos where empleado_id in (select nuevo from pares);
delete from vacaciones where empleado_id in (select nuevo from pares);
delete from puestos where empleado_id in (select nuevo from pares);
delete from home_office_semanal where empleado_id in (select nuevo from pares);
delete from eventos_calendario where empleado_id in (select nuevo from pares);
delete from empleados where id in (select nuevo from pares);

-- Regla de reenvío, alias y buzón compartido: no son empleados
delete from empleados where id in (900, 908, 889);

-- Completar el canónico con lo que aportaba el duplicado. `activo` queda afuera
-- a propósito (ver cabecera).
update empleados e set
  email               = coalesce(e.email, a.email),
  dni                 = coalesce(e.dni, a.dni),
  celular             = coalesce(e.celular, a.celular),
  contacto_emergencia = coalesce(e.contacto_emergencia, a.contacto_emergencia),
  equipo_ingreso      = coalesce(e.equipo_ingreso, a.equipo_ingreso),
  fecha_ingreso       = coalesce(e.fecha_ingreso, a.fecha_ingreso),
  fecha_nacimiento    = coalesce(e.fecha_nacimiento, a.fecha_nacimiento),
  direccion           = coalesce(e.direccion, a.direccion),
  movilidad           = coalesce(e.movilidad, a.movilidad),
  modalidad           = coalesce(e.modalidad, a.modalidad)
  from aporte a
 where e.id = a.viejo;

-- Emails scrapeados del href y celdas con "-" como valor
update empleados
   set email = nullif(nullif(trim(regexp_replace(email, '^mailto:', '', 'i')), ''), '-')
 where email like 'mailto:%' or email = '-';
