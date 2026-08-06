import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  ExecuteRequest,
  ExecuteResponse,
  ProposedAction
} from '@/features/ai-assistant/api/types';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY no configurada');
  return createClient(url, key);
}

const ALLOWED_TABLES = [
  'empleados',
  'sueldos',
  'vacaciones',
  'lineas_moviles',
  'flota_laptops',
  'home_office_semanal',
  'reuniones',
  'manuales',
  'notificaciones',
  'puestos'
];

// Filas que van a ser tocadas por la acción (estado previo, para el audit log)
async function fetchBefore(
  db: SupabaseClient,
  action: ProposedAction
): Promise<Record<string, unknown>[]> {
  const keyCol = action.type === 'upsert' ? action.conflict_column : action.match_column;
  if (!keyCol) return [];
  const values = action.records.map((r) => r[keyCol]).filter((v) => v != null);
  if (values.length === 0) return [];
  const { data } = await db
    .from(action.table as never)
    .select('*')
    .in(keyCol, values as never[]);
  return (data ?? []) as Record<string, unknown>[];
}

// Registro durable del cambio: quién/cuándo/qué, con antes y después.
async function logAgentAction(
  db: SupabaseClient,
  action: ProposedAction,
  sessionId: string | undefined,
  before: Record<string, unknown>[],
  after: Record<string, unknown>[],
  affected: number,
  error?: string
) {
  const { error: logError } = await db.from('ai_agent_log' as never).insert({
    session_id: sessionId ?? null,
    action_type: action.type,
    table_name: action.table,
    description: action.description ?? null,
    risk: action.risk ?? null,
    records_before: before,
    records_after: after,
    affected,
    status: error ? 'error' : 'executed',
    error: error ?? null
  } as never);
  if (logError) console.error('[ai/execute] no se pudo escribir ai_agent_log:', logError.message);
}

export async function POST(request: Request) {
  const body = (await request.json()) as ExecuteRequest;
  const { action } = body;

  if (!action?.type || !action?.table) {
    return NextResponse.json({ error: 'action.type y action.table requeridos' }, { status: 400 });
  }

  if (!ALLOWED_TABLES.includes(action.table)) {
    return NextResponse.json({ error: `Tabla no permitida: ${action.table}` }, { status: 403 });
  }

  if (!action.records || action.records.length === 0) {
    return NextResponse.json({ error: 'action.records requerido' }, { status: 400 });
  }

  const db = getAdminClient();
  let affected = 0;
  let errorMsg: string | undefined;
  const after: Record<string, unknown>[] = [];

  const before = await fetchBefore(db, action);

  if (action.type === 'upsert') {
    const { data, error } = await db
      .from(action.table as never)
      .upsert(action.records, { onConflict: action.conflict_column ?? 'id' })
      .select();
    if (error) errorMsg = error.message;
    else {
      affected = (data as unknown[]).length;
      after.push(...((data ?? []) as Record<string, unknown>[]));
    }
  } else if (action.type === 'update' && action.match_column) {
    for (const record of action.records) {
      const matchVal = record[action.match_column];
      const { data, error } = await db
        .from(action.table as never)
        .update(record)
        .eq(action.match_column, matchVal)
        .select();
      if (error) {
        errorMsg = error.message;
        break;
      }
      affected += (data as unknown[]).length;
      after.push(...((data ?? []) as Record<string, unknown>[]));
    }
  } else if (action.type === 'delete' && action.match_column) {
    // Solo empleados tiene columna `activo`; en el resto es borrado real
    const softDelete = action.table === 'empleados';
    for (const record of action.records) {
      const matchVal = record[action.match_column];
      const query = db.from(action.table as never);
      const { data, error } = softDelete
        ? await query.update({ activo: false }).eq(action.match_column, matchVal).select()
        : await query.delete().eq(action.match_column, matchVal).select();
      if (error) {
        errorMsg = error.message;
        break;
      }
      affected += (data as unknown[]).length;
      after.push(...((data ?? []) as Record<string, unknown>[]));
    }
  } else {
    return NextResponse.json({ error: 'Tipo de acción no soportado' }, { status: 400 });
  }

  await logAgentAction(db, action, body.session_id, before, after, affected, errorMsg);

  return NextResponse.json<ExecuteResponse>({ affected, error: errorMsg });
}
