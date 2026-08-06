import { supabase } from '@/lib/supabase';
import type { EmpleadoOption, Sueldo, SueldoInput } from './types';

export async function getSueldosByAnio(anio: number): Promise<Sueldo[]> {
  const { data, error } = await supabase
    .from('sueldos')
    .select('*, empleados(nombre_apellido)')
    .eq('anio', anio)
    .order('mes', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Sueldo[];
}

export async function getAniosDisponibles(): Promise<number[]> {
  const { data, error } = await supabase.from('sueldos').select('anio');
  if (error) return [];
  const set = new Set((data ?? []).map((r) => r.anio as number));
  return Array.from(set).toSorted((a, b) => b - a);
}

export async function getEmpleadosParaSueldo(): Promise<EmpleadoOption[]> {
  const { data, error } = await supabase
    .from('empleados')
    .select('id, nombre_apellido')
    .eq('activo', true)
    .order('nombre_apellido');
  if (error) throw new Error(error.message);
  return (data ?? []) as EmpleadoOption[];
}

// La moneda es parte de la identidad del sueldo: un empleado puede cobrar en
// PESOS ARG y en USD el mismo mes, y son dos filas distintas. Omitirla acá hacía
// que cargar una moneda pisara la otra.
export async function upsertSueldo(input: SueldoInput): Promise<void> {
  const { error } = await supabase
    .from('sueldos')
    .upsert(input, { onConflict: 'empleado_id,mes,anio,moneda,tipo_concepto' });
  if (error) throw new Error(error.message);
}

export async function deleteSueldo(id: number): Promise<void> {
  const { error } = await supabase.from('sueldos').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteSueldoByKey(
  empleado_id: number,
  mes: number,
  anio: number,
  moneda: SueldoInput['moneda']
): Promise<void> {
  const { error } = await supabase
    .from('sueldos')
    .delete()
    .match({ empleado_id, mes, anio, moneda });
  if (error) throw new Error(error.message);
}
