'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { toast } from 'sonner';
import { getVersiones, restaurarVersion } from '@/features/legajo/api/service';
import type { VersionInfo } from '@/features/legajo/api/types';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useState } from 'react';

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function operacionBadge(op: VersionInfo['operacion']) {
  const map: Record<
    string,
    { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
  > = {
    creacion: { label: 'Creación', variant: 'outline' },
    actualizacion: { label: 'Actualización', variant: 'secondary' },
    eliminacion: { label: 'Eliminación', variant: 'destructive' },
    restauracion: { label: 'Restauración', variant: 'outline' }
  };
  const b = map[op] ?? { label: op, variant: 'outline' };
  return <Badge variant={b.variant}>{b.label}</Badge>;
}

function DiffRows({ cambios }: { cambios: Record<string, { anterior: unknown; nuevo: unknown }> }) {
  if (!cambios || Object.keys(cambios).length === 0) return null;
  return (
    <div className='mt-2 border rounded-md overflow-hidden text-xs'>
      <table className='w-full'>
        <thead>
          <tr className='bg-muted/50'>
            <th className='px-3 py-1.5 text-left font-medium text-muted-foreground'>Campo</th>
            <th className='px-3 py-1.5 text-left font-medium text-muted-foreground'>Anterior</th>
            <th className='px-3 py-1.5 text-left font-medium text-muted-foreground'>Nuevo</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(cambios).map(([campo, diff]) => (
            <tr key={campo} className='border-t'>
              <td className='px-3 py-1.5 font-medium'>{campo}</td>
              <td className='px-3 py-1.5 text-muted-foreground line-through'>
                {String(diff.anterior ?? '—')}
              </td>
              <td className='px-3 py-1.5 text-emerald-600 dark:text-emerald-400'>
                {String(diff.nuevo ?? '—')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function VersionTimeline({
  entidadTabla,
  entidadId
}: {
  entidadTabla: string;
  entidadId: number;
}) {
  const queryClient = useQueryClient();
  const [restoreTarget, setRestoreTarget] = useState<VersionInfo | null>(null);
  const [restoring, setRestoring] = useState(false);

  const { data: versiones = [], isLoading } = useQuery({
    queryKey: ['versiones', entidadTabla, entidadId],
    queryFn: () => getVersiones(entidadTabla, entidadId)
  });

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await restaurarVersion(entidadTabla, entidadId, restoreTarget.version);
      queryClient.invalidateQueries({ queryKey: ['versiones', entidadTabla, entidadId] });
      queryClient.invalidateQueries({ queryKey: ['legajo', entidadId] });
      queryClient.invalidateQueries({ queryKey: ['empleados'] });
      toast.success(`Restaurado a versión ${restoreTarget.version}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al restaurar');
    } finally {
      setRestoring(false);
      setRestoreTarget(null);
    }
  };

  if (isLoading) {
    return <p className='text-muted-foreground text-sm italic'>Cargando historial...</p>;
  }

  if (versiones.length === 0) {
    return <p className='text-muted-foreground text-sm italic'>Sin versiones registradas.</p>;
  }

  return (
    <div className='space-y-3'>
      <div className='space-y-0'>
        {versiones.map((v, i) => (
          <div key={v.id} className='relative pl-8 pb-4 last:pb-0'>
            {i < versiones.length - 1 && (
              <div className='absolute left-[11px] top-5 bottom-0 w-px bg-border' />
            )}
            <div
              className={`absolute left-1 top-1.5 w-[9px] h-[9px] rounded-full border-2 ${
                v.operacion === 'creacion'
                  ? 'bg-emerald-500 border-emerald-500'
                  : v.operacion === 'eliminacion'
                    ? 'bg-red-500 border-red-500'
                    : v.operacion === 'restauracion'
                      ? 'bg-blue-500 border-blue-500'
                      : 'bg-muted-foreground border-muted-foreground'
              }`}
            />

            <div className='flex items-center gap-2'>
              <span className='text-sm font-semibold'>v{v.version}</span>
              {operacionBadge(v.operacion)}
              <span className='text-xs text-muted-foreground'>{formatDate(v.created_at)}</span>
              <span className='text-xs text-muted-foreground'>— {v.usuario}</span>
            </div>

            {v.operacion !== 'creacion' && v.operacion !== 'restauracion' && (
              <DiffRows cambios={v.cambios} />
            )}
            {v.operacion === 'restauracion' && v.cambios?.accion && (
              <p className='text-xs text-muted-foreground mt-1'>{String(v.cambios.accion)}</p>
            )}

            {v.operacion !== 'eliminacion' && (
              <Button
                variant='ghost'
                size='sm'
                className='mt-1 h-6 text-xs'
                onClick={() => setRestoreTarget(v)}
              >
                <Icons.undo className='mr-1 h-3 w-3' />
                Restaurar
              </Button>
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
        }}
        title={`¿Restaurar versión ${restoreTarget?.version}?`}
        description={`Se restaurará el estado del registro al ${restoreTarget ? formatDate(restoreTarget.created_at) : ''}. La restauración genera una nueva versión en el historial.`}
        confirmLabel='Restaurar'
        onConfirm={handleRestore}
        loading={restoring}
      />
    </div>
  );
}
