-- ============================================================================
-- Vacaciones: una fila por rango cargado, no una fila por mes
--
-- Síntoma: cargar vacaciones del 5 al 9 de octubre para alguien que ya tenía
-- un día cargado en octubre no aparecía en el calendario. Ni desde el diálogo
-- ni desde el agente: las dos usan registrar_vacaciones().
--
-- Causa: vacaciones_dias era único por (vacaciones_id, anio_uso, mes) y la
-- función hacía `on conflict ... do update set dias_usados = dias_usados + n`.
-- El segundo rango del mismo mes sólo sumaba días a la fila vieja y nunca
-- tocaba fecha_inicio/fecha_fin, así que el calendario —que dibuja el rango
-- fecha_inicio..fecha_fin— seguía mostrando únicamente el rango original.
-- El empleado quedaba con más días consumidos y ninguna vacación nueva visible.
--
-- Arreglo: cada registro inserta sus propias filas, una por mes que abarca,
-- con el tramo real (fecha_inicio, fecha_fin) de ese mes. Nunca se acumula
-- sobre una fila existente. Revertir borra los tramos de ese rango.
--
-- De paso se corrigen dos cosas del cálculo anterior:
--   * el loop `mes_inicio..mes_fin` rompía cualquier rango que cruzara de
--     diciembre a enero (12..1 no itera);
--   * los tramos intermedios y el último mes quedaban sin fecha_inicio o sin
--     fecha_fin, y el calendario los dibujaba como un chip suelto el día 1.
-- ============================================================================

-- Un mes puede tener varios rangos; lo que no puede repetirse es el rango.
alter table vacaciones_dias drop constraint if exists vacaciones_dias_vac_anio_mes_key;
create unique index if not exists vacaciones_dias_vac_rango_key
  on vacaciones_dias (vacaciones_id, fecha_inicio, fecha_fin);

create or replace function public.registrar_vacaciones(
  p_empleado_id bigint,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_periodo_anio integer
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_vacaciones_id bigint;
  v_dias_usados integer;
  v_seg_inicio date;
  v_seg_fin date;
  v_solapado text;
begin
  if p_fecha_inicio > p_fecha_fin then
    raise exception 'La fecha de inicio debe ser anterior o igual a la fecha de fin';
  end if;

  -- Dos períodos de vacaciones de la misma persona no pueden pisarse: si se
  -- permitiera, el saldo contaría dos veces los mismos días.
  select to_char(vd.fecha_inicio, 'DD/MM/YYYY') || ' al ' || to_char(vd.fecha_fin, 'DD/MM/YYYY')
    into v_solapado
    from vacaciones_dias vd
    join vacaciones v on v.id = vd.vacaciones_id
   where v.empleado_id = p_empleado_id
     and vd.fecha_inicio is not null
     and vd.fecha_fin is not null
     and vd.fecha_inicio <= p_fecha_fin
     and vd.fecha_fin >= p_fecha_inicio
   limit 1;

  if v_solapado is not null then
    raise exception 'El empleado ya tiene vacaciones cargadas del %', v_solapado;
  end if;

  v_dias_usados := (p_fecha_fin - p_fecha_inicio) + 1;

  insert into vacaciones (empleado_id, anio, saldo_inicial, dias_correspondientes, saldo_actual)
  values (p_empleado_id, p_periodo_anio, v_dias_usados, v_dias_usados, 0)
  on conflict (empleado_id, anio)
  do update set
    saldo_inicial = vacaciones.saldo_inicial + v_dias_usados,
    dias_correspondientes = vacaciones.dias_correspondientes + v_dias_usados,
    saldo_actual = vacaciones.saldo_actual - v_dias_usados
  returning id into v_vacaciones_id;

  -- Un tramo por mes calendario que toca el rango. Se avanza por mes real, así
  -- que un rango que cruza de año (28/12 al 5/1) también funciona.
  v_seg_inicio := p_fecha_inicio;
  while v_seg_inicio <= p_fecha_fin loop
    v_seg_fin := least(
      p_fecha_fin,
      (date_trunc('month', v_seg_inicio) + interval '1 month - 1 day')::date
    );

    insert into vacaciones_dias (
      vacaciones_id, mes, dias_usados, fecha_inicio, fecha_fin, anio_uso
    )
    values (
      v_vacaciones_id,
      extract(month from v_seg_inicio)::int,
      (v_seg_fin - v_seg_inicio) + 1,
      v_seg_inicio,
      v_seg_fin,
      extract(year from v_seg_inicio)::int
    );

    v_seg_inicio := v_seg_fin + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'vacaciones_id', v_vacaciones_id,
    'dias_usados', v_dias_usados,
    'periodo', p_periodo_anio
  );
end;
$function$;

create or replace function public.revertir_vacaciones(
  p_empleado_id bigint,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_periodo_anio integer
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_vacaciones_id bigint;
  v_dias_usados integer;
  v_borradas integer;
  v_saldo_inicial numeric;
  v_dias_correspondientes integer;
begin
  select id into v_vacaciones_id
    from vacaciones
   where empleado_id = p_empleado_id and anio = p_periodo_anio;

  if v_vacaciones_id is null then
    raise exception 'No hay vacaciones registradas para este empleado en el año %', p_periodo_anio;
  end if;

  v_dias_usados := (p_fecha_fin - p_fecha_inicio) + 1;

  -- Se borran los tramos que caen dentro del rango que se está revirtiendo:
  -- son exactamente los que insertó registrar_vacaciones con esos argumentos.
  delete from vacaciones_dias
   where vacaciones_id = v_vacaciones_id
     and fecha_inicio >= p_fecha_inicio
     and fecha_fin <= p_fecha_fin;
  get diagnostics v_borradas = row_count;

  if v_borradas = 0 then
    raise exception 'No hay vacaciones cargadas entre % y % para revertir', p_fecha_inicio, p_fecha_fin;
  end if;

  update vacaciones
     set saldo_inicial = saldo_inicial - v_dias_usados,
         dias_correspondientes = dias_correspondientes - v_dias_usados,
         saldo_actual = saldo_actual + v_dias_usados
   where id = v_vacaciones_id
  returning saldo_inicial, dias_correspondientes into v_saldo_inicial, v_dias_correspondientes;

  if v_saldo_inicial <= 0 and v_dias_correspondientes <= 0 then
    delete from vacaciones where id = v_vacaciones_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'vacaciones_id', v_vacaciones_id,
    'dias_revertidos', v_dias_usados
  );
end;
$function$;

grant execute on function registrar_vacaciones(bigint, date, date, integer)
  to anon, authenticated, service_role;
grant execute on function revertir_vacaciones(bigint, date, date, integer)
  to anon, authenticated, service_role;
