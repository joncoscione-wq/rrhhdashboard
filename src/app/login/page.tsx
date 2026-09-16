'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Icons } from '@/components/icons';

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(value: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: value })
      });
      if (res.ok) {
        router.replace('/dashboard/overview');
        return;
      }
      // Solo los 4xx traen un mensaje pensado para el usuario (PIN incorrecto,
      // demasiados intentos). Un 5xx es una falla interna: mostrar su `error`
      // le escupía cosas como "TypeError: fetch failed" al usuario.
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(
        res.status < 500
          ? (data.error ?? 'Error al iniciar sesión')
          : 'El servidor no está disponible. Probá de nuevo en unos minutos.'
      );
      setPin('');
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className='bg-background flex min-h-svh items-center justify-center p-4'>
      <Card className='w-full max-w-sm'>
        <CardHeader className='items-center text-center'>
          <div className='bg-primary/10 mb-2 flex h-12 w-12 items-center justify-center rounded-full'>
            <Icons.lock className='text-primary h-6 w-6' />
          </div>
          <CardTitle>Dashboard RRHH</CardTitle>
          <CardDescription>Ingresá el PIN de 6 dígitos para acceder</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col items-center gap-4'>
          <InputOTP
            maxLength={6}
            value={pin}
            onChange={(value) => {
              setPin(value);
              setError(null);
              if (value.length === 6) submit(value);
            }}
            disabled={loading}
          >
            <InputOTPGroup>
              {Array.from({ length: 6 }).map((_, i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          {loading && <p className='text-muted-foreground text-sm'>Verificando…</p>}
          {error && <p className='text-destructive text-center text-sm'>{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
