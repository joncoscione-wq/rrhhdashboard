'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { ProposedAction } from '../api/types';

const RISK_COLORS = {
  low: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800',
  medium: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800',
  high: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
};

const RISK_BADGE = {
  low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  high: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
};

type Props = {
  action: ProposedAction;
  onApprove: () => void;
  onReject: () => void;
  onRevert: (logId: number) => void;
  isExecuting: boolean;
};

export function ActionPreview({ action, onApprove, onReject, onRevert, isExecuting }: Props) {
  const [showRecords, setShowRecords] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Una operación de negocio (cargar vacaciones) no escribe una tabla: llama a
  // una función del dominio que además mueve saldos. Se muestra distinto para
  // que el usuario entienda qué está aprobando.
  const esOperacion = action.kind === 'operation' || action.type === 'operation';

  const handleEjecutar = () => {
    if (action.risk === 'high') {
      setConfirmOpen(true);
    } else {
      onApprove();
    }
  };

  if (action.status === 'reverted') {
    return (
      <div className='flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground'>
        <Icons.undo className='h-4 w-4' />
        <span>Acción deshecha — los datos volvieron a su estado anterior</span>
      </div>
    );
  }

  if (action.status === 'executed') {
    const logId = action.result?.log_id;
    return (
      <div className='flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-800 dark:bg-emerald-950/30'>
        <Icons.circleCheck className='h-4 w-4 text-emerald-600' />
        <span className='text-emerald-700 dark:text-emerald-300'>
          Ejecutado — {action.result?.affected}{' '}
          {action.result?.affected === 1 ? 'registro' : 'registros'} afectados
        </span>
        {logId !== undefined && (
          <Button
            size='sm'
            variant='ghost'
            className='ml-auto h-6 text-xs'
            onClick={() => onRevert(logId)}
            disabled={isExecuting}
          >
            {isExecuting ? (
              <Icons.spinner className='mr-1 h-3 w-3 animate-spin' />
            ) : (
              <Icons.undo className='mr-1 h-3 w-3' />
            )}
            Deshacer
          </Button>
        )}
      </div>
    );
  }

  if (action.status === 'rejected') {
    return (
      <div className='flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground'>
        <Icons.xCircle className='h-4 w-4' />
        <span>Acción rechazada</span>
      </div>
    );
  }

  if (action.status === 'error') {
    return (
      <div className='flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm dark:border-red-800 dark:bg-red-950/30'>
        <Icons.alertCircle className='h-4 w-4 text-red-600' />
        <span className='text-red-700 dark:text-red-300'>Error: {action.result?.error}</span>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-3 text-sm space-y-2 ${RISK_COLORS[action.risk]}`}>
      <div className='flex items-start justify-between gap-2'>
        <div className='flex items-center gap-2 flex-wrap'>
          <Icons.sparkles className='h-4 w-4 text-muted-foreground shrink-0' />
          <span className='font-medium'>
            {esOperacion ? 'Operación propuesta' : 'Acción propuesta'}
          </span>
          <Badge variant='outline' className={`text-[10px] ${RISK_BADGE[action.risk]}`}>
            {action.risk === 'high'
              ? '⚠️ riesgo alto'
              : action.risk === 'medium'
                ? 'riesgo medio'
                : 'riesgo bajo'}
          </Badge>
          <Badge variant='outline' className='text-[10px]'>
            {esOperacion ? `⚙ ${action.operation}` : `${action.type} → ${action.table}`}
          </Badge>
        </div>
      </div>

      <p className='text-muted-foreground'>{action.description}</p>

      {action.affected_rows_estimate !== undefined && (
        <p className='text-xs text-muted-foreground'>
          ~{action.affected_rows_estimate}{' '}
          {action.affected_rows_estimate === 1 ? 'registro' : 'registros'} afectados
        </p>
      )}

      {esOperacion ? (
        <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded bg-black/5 p-2 text-xs dark:bg-white/5'>
          {Object.entries(action.operation_args ?? {}).map(([clave, valor]) => (
            <div key={clave} className='contents'>
              <dt className='text-muted-foreground'>{clave}</dt>
              <dd className='font-mono'>{String(valor)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <>
          {action.records.length > 0 && (
            <button
              onClick={() => setShowRecords(!showRecords)}
              className='text-xs text-primary hover:underline flex items-center gap-1'
            >
              {showRecords ? (
                <Icons.chevronUp className='h-3 w-3' />
              ) : (
                <Icons.chevronDown className='h-3 w-3' />
              )}
              {showRecords ? 'Ocultar' : 'Ver'} datos ({action.records.length} filas)
            </button>
          )}

          {showRecords && (
            <pre className='overflow-x-auto rounded bg-black/5 p-2 text-xs dark:bg-white/5 max-h-48'>
              {JSON.stringify(action.records.slice(0, 5), null, 2)}
              {action.records.length > 5 && `\n... y ${action.records.length - 5} más`}
            </pre>
          )}
        </>
      )}

      <div className='flex gap-2 pt-1'>
        <Button size='sm' className='h-7 text-xs' onClick={handleEjecutar} disabled={isExecuting}>
          {isExecuting ? (
            <Icons.spinner className='mr-1 h-3 w-3 animate-spin' />
          ) : (
            <Icons.circleCheck className='mr-1 h-3 w-3' />
          )}
          Ejecutar
        </Button>
        <Button
          size='sm'
          variant='outline'
          className='h-7 text-xs'
          onClick={onReject}
          disabled={isExecuting}
        >
          Rechazar
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title='⚠️ Acción de riesgo alto'
        description={`${action.description} — Esta acción afecta la tabla "${action.table}". Queda registrada con el estado previo, así que se puede deshacer, pero revisá los datos antes de ejecutarla.`}
        confirmLabel='Sí, ejecutar'
        onConfirm={() => {
          setConfirmOpen(false);
          onApprove();
        }}
        loading={isExecuting}
        destructive
      />
    </div>
  );
}
