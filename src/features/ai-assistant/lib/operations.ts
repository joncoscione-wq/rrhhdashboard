/**
 * Operaciones de negocio que el agente puede proponer.
 *
 * `propose_action` escribe tablas. Eso alcanza para lo que es una fila y nada
 * más (un evento de calendario, una reunión, un sueldo), pero rompe cuando la
 * carga implica varias tablas y un invariante.
 *
 * El caso que lo motivó: cargar vacaciones. `vacaciones_dias` ni siquiera tiene
 * `empleado_id` —cuelga de `vacaciones_id`, la fila del año de esa persona— y
 * además hay que repartir los días entre los meses que abarca el período y
 * descontarlos del saldo. Escribir la tabla a mano dejaba el saldo desfasado
 * sin ningún error visible.
 *
 * Para eso ya existía `registrar_vacaciones()` en Postgres, que es lo que usa
 * el dashboard. Estas operaciones se la dan al agente, con el mismo camino de
 * confirmación y auditoría que las escrituras crudas.
 */

export type OperationParam = {
  name: string;
  type: 'number' | 'string' | 'date';
  description: string;
};

export type OperationDef = {
  name: string;
  rpc: string;
  /** Tabla/entidad de negocio afectada, para el log de auditoría */
  entidad: string;
  description: string;
  params: OperationParam[];
  /** Operación que la deshace, con exactamente los mismos argumentos */
  inversa?: string;
  risk: 'low' | 'medium' | 'high';
};

export const OPERATIONS: Record<string, OperationDef> = {
  registrar_vacaciones: {
    name: 'registrar_vacaciones',
    rpc: 'registrar_vacaciones',
    entidad: 'vacaciones',
    description:
      'Carga un período de vacaciones de un empleado. Reparte los días entre los meses que abarca, descuenta del saldo del año y lo hace visible en el calendario como licencia. Es la ÚNICA forma correcta de cargar vacaciones.',
    params: [
      { name: 'empleado_id', type: 'number', description: 'Id del empleado' },
      {
        name: 'fecha_inicio',
        type: 'date',
        description: 'Primer día de vacaciones, formato YYYY-MM-DD'
      },
      {
        name: 'fecha_fin',
        type: 'date',
        description: 'Último día de vacaciones inclusive, formato YYYY-MM-DD'
      },
      {
        name: 'periodo_anio',
        type: 'number',
        description:
          'Año del período al que se imputan los días. Suele ser el año de fecha_inicio, pero puede ser anterior si se están usando días arrastrados.'
      }
    ],
    inversa: 'revertir_vacaciones',
    risk: 'medium'
  },

  revertir_vacaciones: {
    name: 'revertir_vacaciones',
    rpc: 'revertir_vacaciones',
    entidad: 'vacaciones',
    description:
      'Da de baja un período de vacaciones ya cargado y devuelve los días al saldo. Los argumentos tienen que ser los mismos con los que se cargó.',
    params: [
      { name: 'empleado_id', type: 'number', description: 'Id del empleado' },
      { name: 'fecha_inicio', type: 'date', description: 'Primer día, formato YYYY-MM-DD' },
      { name: 'fecha_fin', type: 'date', description: 'Último día inclusive, formato YYYY-MM-DD' },
      { name: 'periodo_anio', type: 'number', description: 'Año del período imputado' }
    ],
    inversa: 'registrar_vacaciones',
    risk: 'medium'
  }
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida los argumentos que propuso el modelo contra la definición y los
 * convierte a los nombres de parámetro que espera la RPC (`p_*`).
 */
export function validarArgumentos(
  def: OperationDef,
  args: Record<string, unknown>
): { rpcArgs: Record<string, unknown> } | { error: string } {
  const rpcArgs: Record<string, unknown> = {};

  for (const param of def.params) {
    const valor = args[param.name];
    if (valor === undefined || valor === null || valor === '') {
      return { error: `Falta el parámetro "${param.name}" en ${def.name}` };
    }

    if (param.type === 'number') {
      const n = Number(valor);
      if (!Number.isFinite(n)) {
        return { error: `"${param.name}" tiene que ser un número, llegó ${JSON.stringify(valor)}` };
      }
      rpcArgs[`p_${param.name}`] = n;
    } else if (param.type === 'date') {
      if (typeof valor !== 'string' || !ISO_DATE.test(valor)) {
        return {
          error: `"${param.name}" tiene que ser una fecha YYYY-MM-DD, llegó ${JSON.stringify(valor)}`
        };
      }
      rpcArgs[`p_${param.name}`] = valor;
    } else {
      rpcArgs[`p_${param.name}`] = String(valor);
    }
  }

  const desconocidos = Object.keys(args).filter((k) => !def.params.some((p) => p.name === k));
  if (desconocidos.length > 0) {
    return { error: `Parámetros que ${def.name} no acepta: ${desconocidos.join(', ')}` };
  }

  return { rpcArgs };
}

/** Resumen legible para la confirmación y el log */
export function describirOperacion(nombre: string, args: Record<string, unknown>): string {
  const def = OPERATIONS[nombre];
  if (!def) return nombre;
  const partes = def.params.map((p) => `${p.name}=${args[p.name]}`);
  return `${nombre}(${partes.join(', ')})`;
}

export const PROPOSE_OPERATION_TOOL = {
  type: 'function' as const,
  function: {
    name: 'propose_operation',
    description:
      'Propone una OPERACIÓN DE NEGOCIO, para casos que tocan varias tablas y tienen que mantener un saldo o un invariante consistente. Usala en vez de propose_action cuando exista una operación para lo que te piden: escribir las tablas a mano en esos casos deja los datos desincronizados. Como todo, se le muestra al usuario para que la confirme.',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: Object.keys(OPERATIONS),
          description: Object.values(OPERATIONS)
            .map((o) => `${o.name}: ${o.description}`)
            .join(' | ')
        },
        description: {
          type: 'string',
          description:
            'Qué hace esta operación y sobre quién, en español claro. Incluí el nombre del empleado y las fechas.'
        },
        args: {
          type: 'object',
          additionalProperties: true,
          description:
            'Argumentos de la operación, con los nombres exactos que declara. Para registrar_vacaciones: empleado_id, fecha_inicio, fecha_fin, periodo_anio.'
        }
      },
      required: ['operation', 'description', 'args']
    }
  }
};
