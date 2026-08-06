import { NextResponse } from 'next/server';
import { getAdminClient } from '@/features/ai-assistant/lib/admin-client';
import { OPERATIONS, validarArgumentos } from '@/features/ai-assistant/lib/operations';
import type { RevertRequest, RevertResponse } from '@/features/ai-assistant/api/types';

export const dynamic = 'force-dynamic';

type LogRow = {
  id: number;
  session_id: string | null;
  action_type: 'upsert' | 'update' | 'delete' | 'operation';
  table_name: string;
  description: string | null;
  records_before: Record<string, unknown>[] | null;
  records_after: Record<string, unknown>[] | null;
  status: string;
  reverted_at: string | null;
  operation: string | null;
  operation_args: Record<string, unknown> | null;
};

/**
 * Deshace una acción del agente usando el estado anterior que quedó guardado en
 * ai_agent_log.
 *
 * Es la contraparte del miedo a "cargar mal y no poder volver": cada escritura
 * del agente es reversible con un click, así que equivocarse cuesta segundos y
 * no una sesión entera de arreglos manuales.
 */
export async function POST(request: Request) {
  const { log_id } = (await request.json()) as RevertRequest;

  if (typeof log_id !== 'number') {
    return NextResponse.json({ error: 'log_id requerido' }, { status: 400 });
  }

  const db = getAdminClient();

  const { data, error: readError } = await db
    .from('ai_agent_log' as never)
    .select('*')
    .eq('id', log_id)
    .single();

  if (readError || !data) {
    return NextResponse.json({ error: 'No se encontró la acción a revertir' }, { status: 404 });
  }

  const log = data as unknown as LogRow;

  if (log.reverted_at) {
    return NextResponse.json({ error: 'Esa acción ya fue revertida' }, { status: 409 });
  }
  if (log.status !== 'executed') {
    return NextResponse.json(
      { error: 'Solo se pueden revertir acciones ejecutadas' },
      { status: 400 }
    );
  }

  // ── Operación de negocio: se deshace con su operación inversa ──────────────
  // No sirve restaurar filas: registrar_vacaciones toca `vacaciones` y
  // `vacaciones_dias` y mueve el saldo, así que lo correcto es llamar a
  // revertir_vacaciones con los mismos argumentos.
  if (log.action_type === 'operation') {
    const def = log.operation ? OPERATIONS[log.operation] : undefined;
    if (!def?.inversa) {
      return NextResponse.json(
        { error: `La operación "${log.operation}" no se puede deshacer automáticamente` },
        { status: 400 }
      );
    }
    const inversa = OPERATIONS[def.inversa];
    const validacion = validarArgumentos(inversa, log.operation_args ?? {});
    if ('error' in validacion) {
      return NextResponse.json({ error: validacion.error }, { status: 400 });
    }

    const { error } = await db.rpc(inversa.rpc, validacion.rpcArgs);
    if (error) {
      return NextResponse.json({ error: `No se pudo deshacer: ${error.message}` }, { status: 500 });
    }

    await db.from('ai_agent_log' as never).insert({
      session_id: log.session_id,
      action_type: 'operation',
      table_name: log.table_name,
      description: `Reversión de la acción #${log.id}: ${log.description ?? 'sin descripción'}`,
      risk: 'low',
      records_before: log.records_after ?? [],
      records_after: [],
      affected: 1,
      status: 'executed',
      operation: inversa.name,
      operation_args: log.operation_args ?? {},
      revert_of: log.id
    } as never);

    await db
      .from('ai_agent_log' as never)
      .update({ reverted_at: new Date().toISOString() } as never)
      .eq('id', log.id);

    return NextResponse.json<RevertResponse>({ restored: 1, removed: 0 });
  }

  const before = log.records_before ?? [];
  const after = log.records_after ?? [];
  let restored = 0;
  let removed = 0;

  // 1. Las filas que ya existían vuelven a su estado previo, con id explícito.
  if (before.length > 0) {
    const { data: res, error } = await db.rpc('ai_execute_action', {
      p_action_type: 'upsert',
      p_table: log.table_name,
      p_records: before,
      p_key_column: 'id'
    });
    if (error) {
      return NextResponse.json(
        { error: `No se pudo restaurar: ${error.message}` },
        { status: 500 }
      );
    }
    restored = (res as { affected?: number })?.affected ?? 0;
  }

  // 2. Las filas que la acción creó (están en `after` pero no en `before`) se dan de baja.
  const idsPrevios = new Set(before.map((r) => r.id));
  const creadas = after
    .filter((r) => r.id != null && !idsPrevios.has(r.id))
    .map((r) => ({ id: r.id }));

  if (creadas.length > 0) {
    const { data: res, error } = await db.rpc('ai_execute_action', {
      p_action_type: 'delete',
      p_table: log.table_name,
      p_records: creadas,
      p_key_column: 'id'
    });
    if (error) {
      return NextResponse.json(
        {
          error: `Se restauraron ${restored} filas pero no se pudieron quitar las nuevas: ${error.message}`
        },
        { status: 500 }
      );
    }
    removed = (res as { affected?: number })?.affected ?? 0;
  }

  await db.from('ai_agent_log' as never).insert({
    session_id: log.session_id,
    action_type: 'update',
    table_name: log.table_name,
    description: `Reversión de la acción #${log.id}: ${log.description ?? 'sin descripción'}`,
    risk: 'low',
    records_before: after,
    records_after: before,
    affected: restored + removed,
    status: 'executed',
    revert_of: log.id
  } as never);

  await db
    .from('ai_agent_log' as never)
    .update({ reverted_at: new Date().toISOString() } as never)
    .eq('id', log.id);

  return NextResponse.json<RevertResponse>({ restored, removed });
}
