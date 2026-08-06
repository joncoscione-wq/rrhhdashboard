import { NextResponse } from 'next/server';
import { getAdminClient } from '@/features/ai-assistant/lib/admin-client';
import {
  OPERATIONS,
  describirOperacion,
  validarArgumentos
} from '@/features/ai-assistant/lib/operations';
import type { ExecuteRequest, ExecuteResponse } from '@/features/ai-assistant/api/types';

export const dynamic = 'force-dynamic';

type LogInput = {
  session_id: string | null;
  action_type: string;
  table_name: string;
  description: string | null;
  risk: string | null;
  records_before: unknown;
  records_after: unknown;
  affected: number;
  status: 'executed' | 'error';
  error: string | null;
  operation?: string;
  operation_args?: Record<string, unknown>;
};

async function registrarEnLog(
  db: ReturnType<typeof getAdminClient>,
  entrada: LogInput
): Promise<number | undefined> {
  const { data, error } = await db
    .from('ai_agent_log' as never)
    .insert(entrada as never)
    .select('id')
    .single();
  if (error) console.error('[ai/execute] no se pudo escribir ai_agent_log:', error.message);
  return (data as { id: number } | null)?.id;
}

export async function POST(request: Request) {
  const body = (await request.json()) as ExecuteRequest;
  const { action } = body;
  const db = getAdminClient();

  // ── Operación de negocio ───────────────────────────────────────────────────
  // Va por una RPC del dominio (registrar_vacaciones y compañía) en vez de
  // escribir tablas: son las que mantienen los saldos y el reparto por mes.
  if (action?.kind === 'operation' || action?.type === 'operation') {
    const def = action.operation ? OPERATIONS[action.operation] : undefined;
    if (!def) {
      return NextResponse.json(
        { error: `Operación desconocida: ${action.operation ?? '(vacía)'}` },
        { status: 400 }
      );
    }

    const validacion = validarArgumentos(def, action.operation_args ?? {});
    if ('error' in validacion) {
      return NextResponse.json({ error: validacion.error }, { status: 400 });
    }

    const { data, error } = await db.rpc(def.rpc, validacion.rpcArgs);
    const resultado = (data ?? {}) as Record<string, unknown>;

    const logId = await registrarEnLog(db, {
      session_id: body.session_id ?? null,
      action_type: 'operation',
      table_name: def.entidad,
      description: action.description ?? describirOperacion(def.name, action.operation_args ?? {}),
      risk: action.risk ?? def.risk,
      // El estado previo de una operación no son filas sino sus argumentos: para
      // deshacerla se llama a la operación inversa con los mismos valores.
      records_before: [],
      records_after: [resultado],
      affected: error ? 0 : 1,
      status: error ? 'error' : 'executed',
      error: error?.message ?? null,
      operation: def.name,
      operation_args: action.operation_args ?? {}
    });

    return NextResponse.json<ExecuteResponse>({
      affected: error ? 0 : 1,
      error: error?.message,
      log_id: logId
    });
  }

  // ── Escritura cruda de tabla ───────────────────────────────────────────────
  if (!action?.type || !action?.table) {
    return NextResponse.json({ error: 'action.type y action.table requeridos' }, { status: 400 });
  }
  if (!action.records || action.records.length === 0) {
    return NextResponse.json({ error: 'action.records requerido' }, { status: 400 });
  }

  const keyColumn =
    (action.type === 'upsert' ? action.conflict_column : action.match_column) ?? 'id';

  // Toda la escritura ocurre dentro de ai_execute_action, así que es una sola
  // transacción: o entran todas las filas o no entra ninguna. La función valida
  // la tabla contra su propia allowlist y las columnas contra el catálogo.
  const { data, error } = await db.rpc('ai_execute_action', {
    p_action_type: action.type,
    p_table: action.table,
    p_records: action.records,
    p_key_column: keyColumn
  });

  const result = (data ?? {}) as {
    affected?: number;
    before?: Record<string, unknown>[];
    after?: Record<string, unknown>[];
  };
  const affected = error ? 0 : (result.affected ?? 0);

  const logId = await registrarEnLog(db, {
    session_id: body.session_id ?? null,
    action_type: action.type,
    table_name: action.table,
    description: action.description ?? null,
    risk: action.risk ?? null,
    records_before: result.before ?? [],
    records_after: result.after ?? [],
    affected,
    status: error ? 'error' : 'executed',
    error: error?.message ?? null
  });

  return NextResponse.json<ExecuteResponse>({
    affected,
    error: error?.message,
    log_id: logId
  });
}
