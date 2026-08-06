-- Agrega soporte de Aguinaldos (SAC) en la tabla sueldos.
-- tipo_concepto distingue sueldo / bono / aguinaldo.
-- semestre indica primer o segundo semestre (solo para aguinaldos).
-- La clave única incluye ahora tipo_concepto: permite que un mismo mes tenga
-- un sueldo Y un aguinaldo para el mismo empleado/moneda.

alter table sueldos add column if not exists tipo_concepto text not null default 'sueldo';
alter table sueldos add column if not exists semestre integer;

-- Check: semestre solo requerido para aguinaldos, y debe ser 1 o 2.
alter table sueldos add constraint chk_semestre_aguinaldo
  check (
    (tipo_concepto = 'aguinaldo' and semestre in (1, 2))
    or (tipo_concepto != 'aguinaldo')
  );

-- La clave única anterior (empleado_id, mes, anio, moneda) debe incluir
-- tipo_concepto para que un sueldo y un aguinaldo del mismo mes puedan coexistir.
alter table sueldos drop constraint if exists sueldos_empleado_id_mes_anio_moneda_key;
alter table sueldos
  add constraint sueldos_empleado_id_mes_anio_moneda_tipo_key
  unique (empleado_id, mes, anio, moneda, tipo_concepto);

comment on column sueldos.tipo_concepto is 'sueldo | bono | aguinaldo — distingue el tipo de concepto salarial';
comment on column sueldos.semestre is '1 = primer semestre, 2 = segundo semestre. Solo para aguinaldos.';

-- Para aguinaldos, mes se auto-deriva del semestre: 1 → 6 (Jun), 2 → 12 (Dic).
-- Esto mantiene la constraint NOT NULL de mes sin agregar complejidad al schema.
