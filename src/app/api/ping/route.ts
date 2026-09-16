import { NextResponse } from 'next/server';
import { getAdminClient } from '@/features/ai-assistant/lib/admin-client';

// Mantiene despierto al proyecto de Supabase: el plan free pausa el proyecto
// tras 7 días sin actividad y, cuando eso pasa, todas las rutas fallan con
// "TypeError: fetch failed" (el host deja de resolver por DNS).
// Corre por cron cada hora (ver vercel.json) y deja la marca en `heartbeat`
// para poder verificar después si realmente se ejecutó.

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Sin secret configurado no se autentica a nadie: si se dejara pasar,
    // bastaría mandar el literal "Bearer undefined" para invocar la ruta.
    console.error('[ping] CRON_SECRET no configurada');
    return NextResponse.json({ error: 'CRON_SECRET no configurada' }, { status: 500 });
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    console.warn('[ping] authorization inválida');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date().toISOString();

  try {
    const { data, error } = await getAdminClient()
      .from('heartbeat')
      .upsert({ id: true, last_ping: now, source: 'cron' })
      .select('last_ping')
      .single();

    if (error) {
      console.error('[ping] falló el upsert:', error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // El exito no se loguea (oxlint prohibe console.log): queda registrado en
    // la fila de `heartbeat`, que es justamente para lo que existe la tabla.
    return NextResponse.json({ ok: true, timestamp: data?.last_ping ?? now });
  } catch (err) {
    // Proyecto pausado o inalcanzable: supabase-js tira TypeError, no lo
    // devuelve como `error`. Sin este catch la función revienta con un 500
    // genérico y no queda nada útil en los logs.
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ping] supabase inalcanzable:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
