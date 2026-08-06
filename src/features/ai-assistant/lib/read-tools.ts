import { supabase } from '@/lib/supabase';

/**
 * Herramienta de lectura del agente.
 *
 * Antes, todo el contexto se precocinaba en el system prompt: el agente solo
 * "veía" lo que buildSystemPrompt había decidido volcar, con recortes (sueldos
 * limitado a 600 filas, reuniones a 50) y sin acceso a `sheet_rows` — que son
 * las ~11.000 filas crudas importadas de los Google Sheets, o sea justamente
 * la fuente que hay que cargar. El agente no podía ver los datos que tenía que
 * migrar. Con `query_data` los consulta a demanda.
 *
 * Es estrictamente de solo lectura: se arma con el query builder de PostgREST
 * sobre una allowlist de tablas, nunca con SQL crudo.
 */

const READABLE_TABLES = [
  // negocio
  'empleados',
  'sueldos',
  'vacaciones',
  'vacaciones_dias',
  'lineas_moviles',
  'flota_laptops',
  'home_office_semanal',
  'reuniones',
  'notificaciones',
  'puestos',
  'eventos_calendario',
  'documentos_empleados',
  // importación desde Google Sheets
  'google_sheets',
  'sheet_syncs',
  'sheet_rows',
  'sheet_sections',
  // auditoría del propio agente
  'ai_agent_log',
  'ai_context_memory',
  // sueldos que quedaron en conflicto al fusionar empleados duplicados
  'merge_sueldos_conflicto'
] as const;

const OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in'] as const;

type Operator = (typeof OPERATORS)[number];

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

// Nombre de columna simple (`nombre_apellido`) o acceso a jsonb estilo
// PostgREST (`data->>Nombre y Apellido`), que es como se filtra sheet_rows.
const COLUMN_RE = /^[a-z0-9_]+(->>?[\p{L}\p{N} _.\-/]+)?$/iu;

type QueryBuilder = Record<Operator, (column: string, value: unknown) => QueryBuilder> & {
  order: (column: string, opts: { ascending: boolean }) => QueryBuilder;
  range: (from: number, to: number) => QueryBuilder;
} & PromiseLike<{
    data: unknown;
    count: number | null;
    error: { message: string } | null;
  }>;

export type QueryDataArgs = {
  table: string;
  select?: string;
  filters?: { column: string; op: Operator; value: unknown }[];
  order?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
  count_only?: boolean;
};

export type QueryDataResult = {
  table: string;
  rows?: Record<string, unknown>[];
  count?: number;
  truncated?: boolean;
  error?: string;
};

export const QUERY_DATA_TOOL = {
  type: 'function' as const,
  function: {
    name: 'query_data',
    description:
      'Consulta datos reales de la base (solo lectura). Usala SIEMPRE antes de proponer una acción, para verificar qué hay cargado y no inventar valores. Sirve tanto para las tablas de negocio como para sheet_rows, que tiene las filas crudas importadas de los Google Sheets.',
    parameters: {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          enum: READABLE_TABLES as unknown as string[],
          description: 'Tabla a consultar'
        },
        select: {
          type: 'string',
          description:
            'Columnas separadas por coma, ej. "id,nombre_apellido,activo". Omitir para traer todas. Pedí solo las que necesitás.'
        },
        filters: {
          type: 'array',
          description: 'Condiciones combinadas con AND',
          items: {
            type: 'object',
            properties: {
              column: {
                type: 'string',
                description:
                  'Columna. Para el jsonb de sheet_rows usar la forma "data->>Nombre de la columna del sheet".'
              },
              op: {
                type: 'string',
                enum: OPERATORS as unknown as string[],
                description:
                  'eq/neq/gt/gte/lt/lte para comparar, ilike para texto parcial (usar % como comodín), is para null/true/false, in para una lista'
              },
              value: {
                description: 'Valor a comparar. Para "in" pasar un array.'
              }
            },
            required: ['column', 'op', 'value']
          }
        },
        order: {
          type: 'object',
          properties: {
            column: { type: 'string' },
            ascending: { type: 'boolean' }
          },
          required: ['column']
        },
        limit: {
          type: 'number',
          description: `Filas a traer (default ${DEFAULT_LIMIT}, máximo ${MAX_LIMIT})`
        },
        offset: { type: 'number', description: 'Para paginar resultados grandes' },
        count_only: {
          type: 'boolean',
          description:
            'Devuelve solo la cantidad de filas que matchean, sin traerlas. Ideal para dimensionar antes de pedir los datos.'
        }
      },
      required: ['table']
    }
  }
};

export async function runQueryData(args: QueryDataArgs): Promise<QueryDataResult> {
  const { table } = args;

  if (!READABLE_TABLES.includes(table as (typeof READABLE_TABLES)[number])) {
    return { table, error: `Tabla no consultable: ${table}` };
  }

  const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(args.offset ?? 0, 0);

  // `select` viaja a PostgREST tal cual, así que se valida columna por columna
  let select = '*';
  if (args.select) {
    const cols = args.select
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const bad = cols.find((c) => !COLUMN_RE.test(c));
    if (bad) return { table, error: `Columna inválida en select: "${bad}"` };
    if (cols.length > 0) select = cols.join(',');
  }

  // La tabla y las columnas son dinámicas (las elige el modelo), así que los
  // genéricos de supabase-js no aportan nada acá y encima explotan al indexar
  // el operador. Se usa una vista mínima del query builder.
  let query = supabase
    .from(table as never)
    .select(
      select,
      args.count_only ? { count: 'exact', head: true } : undefined
    ) as unknown as QueryBuilder;

  for (const f of args.filters ?? []) {
    if (!COLUMN_RE.test(f.column)) {
      return { table, error: `Columna inválida en filtro: "${f.column}"` };
    }
    if (!OPERATORS.includes(f.op)) {
      return { table, error: `Operador inválido: "${f.op}"` };
    }
    if (f.op === 'in') {
      query = query.in(f.column, Array.isArray(f.value) ? f.value : [f.value]);
    } else {
      query = query[f.op](f.column, f.value);
    }
  }

  if (args.order) {
    if (!COLUMN_RE.test(args.order.column)) {
      return { table, error: `Columna inválida en order: "${args.order.column}"` };
    }
    query = query.order(args.order.column, { ascending: args.order.ascending ?? true });
  }

  if (!args.count_only) {
    query = query.range(offset, offset + limit - 1);
  }

  const { data, count, error } = await query;

  if (error) return { table, error: error.message };
  if (args.count_only) return { table, count: count ?? 0 };

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return { table, rows, count: rows.length, truncated: rows.length === limit };
}
