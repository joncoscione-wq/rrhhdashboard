export type Sueldo = {
  id: number;
  empleado_id: number;
  empresa_id: number;
  moneda: 'PESOS ARG' | 'USD';
  mes: number;
  anio: number;
  monto: number | null;
  bono_anual: number | null;
  tipo_concepto: 'sueldo' | 'bono' | 'aguinaldo';
  semestre: number | null;
  empleados: { nombre_apellido: string } | null;
};

export type SueldosPorEmpleado = {
  nombre_apellido: string;
  moneda: 'PESOS ARG' | 'USD';
  meses: (number | null)[];
};

export type AguinaldoRow = {
  nombre_apellido: string;
  semestre: number;
  monto: number;
  moneda: 'PESOS ARG' | 'USD';
};

export type EmpleadoOption = {
  id: number;
  nombre_apellido: string;
};

export type SueldoInput = {
  empleado_id: number;
  empresa_id: number;
  moneda: 'PESOS ARG' | 'USD';
  mes: number;
  anio: number;
  monto: number | null;
  bono_anual: number | null;
  tipo_concepto: 'sueldo' | 'bono' | 'aguinaldo';
  semestre: number | null;
};
