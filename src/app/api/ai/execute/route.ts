import { NextResponse } from 'next/server';
import { getAdminClient } from '@/features/ai-assistant/lib/admin-client';
import type { ExecuteRequest, ExecuteResponse } from '@/features/ai-assistant/api/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = (await request.json()) as ExecuteRequest;
  const { action } = body;

  if (!action?.type || !action?.table) {
    return NextResponse.json({ error: 'action.type y action.table requeridos' }, { status: 400 });
  }
  if (!action.records || action.records.length === 0) {
    return NextResponse.json({ error: 'action.records requerido' }, { status: 400 });
  }

  const keyColumn =
    (action.type === 'upsert' ? action.conflict_column : action.match_column) ?? 'id';

  const db = getAdminClient();

  // Toda la escritura ocurre dentro de ai_execute_action, así que es una sola
  // transacción: o entran todas las filas o no entra ninguna. Antes era un for
  // en TypeScript y un error en la fila 30 de 55 dejaba la carga a medias.
  // La función valida la tabla contra su propia allowlist y las columnas contra
  // el catálogo de Postgres.
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

  const { data: logRow, error: logError } = await db
    .from('ai_agent_log' as never)
    .insert({
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
    } as never)
    .select('id')
    .single();

  if (logError) console.error('[ai/execute] no se pudo escribir ai_agent_log:', logError.message);

  return NextResponse.json<ExecuteResponse>({
    affected,
    error: error?.message,
    log_id: (logRow as { id: number } | null)?.id
  });
}
