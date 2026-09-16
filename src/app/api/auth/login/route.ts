import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth';

export async function POST(request: Request) {
  const { pin } = (await request.json()) as { pin?: string };

  if (!pin || !/^\d{6}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN de 6 dígitos requerido' }, { status: 400 });
  }

  let data: unknown;
  try {
    // Si el proyecto de Supabase está pausado, supabase-js tira un TypeError
    // en vez de devolverlo en `error`. Sin este catch la ruta reventaba y el
    // login mostraba "TypeError: fetch failed" en pantalla.
    const res = await supabase.rpc('verify_pin', { pin });
    if (res.error) {
      console.error('[login] verify_pin falló:', res.error.message);
      return NextResponse.json({ error: 'Error al verificar el PIN' }, { status: 500 });
    }
    data = res.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[login] supabase inalcanzable:', message);
    return NextResponse.json({ error: 'Base de datos no disponible' }, { status: 503 });
  }

  const result = data as {
    ok: boolean;
    locked?: boolean;
    retry_seconds?: number;
    remaining?: number;
  };

  if (!result.ok) {
    if (result.locked) {
      const min = Math.ceil((result.retry_seconds ?? 300) / 60);
      return NextResponse.json(
        { error: `Demasiados intentos. Probá de nuevo en ${min} min.` },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: `PIN incorrecto. Te quedan ${result.remaining ?? 0} intentos.` },
      { status: 401 }
    );
  }

  const token = await createSessionToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE
  });
  return response;
}
