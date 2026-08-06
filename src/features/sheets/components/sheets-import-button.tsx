'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';

export function SheetsImportButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const { data: sheets = [] } = useQuery({
    queryKey: ['sheets-import', 'connected'],
    queryFn: async () => {
      const { data, error } = await supabase.from('google_sheets').select('id, name, url');
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: number; name: string; url: string }[];
    },
    enabled: open
  });

  const handleSync = async (sheetId: number, url: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/sheets/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetId: String(sheetId), url })
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error ?? 'Error al sincronizar');
        return;
      }
      toast.success(
        `Sincronizado: ${result.tabs_synced ?? 0} pestañas, ${result.rows_imported ?? 0} filas`
      );
      setOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al sincronizar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='outline' size='sm'>
          <Icons.sheets className='mr-2 h-4 w-4' />
          Importar desde Google Sheets
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2 text-base'>
            <Icons.sheets className='h-4 w-4' /> Importar desde Google Sheets
          </DialogTitle>
          <DialogDescription>
            Seleccioná una planilla ya conectada para sincronizar sus datos.
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-3 pt-2'>
          {sheets.length === 0 ? (
            <p className='text-sm text-muted-foreground text-center py-4'>
              No hay planillas conectadas.{' '}
              <span className='text-destructive block mt-1'>
                Contactá al administrador del sistema para conectar una planilla.
              </span>
            </p>
          ) : (
            sheets.map((sheet) => (
              <div
                key={sheet.id}
                className='flex items-center justify-between rounded-lg border p-3'
              >
                <div className='min-w-0 flex-1'>
                  <p className='text-sm font-medium truncate'>{sheet.name}</p>
                  <p className='text-xs text-muted-foreground truncate'>{sheet.url}</p>
                </div>
                <Button
                  size='sm'
                  variant='secondary'
                  onClick={() => handleSync(sheet.id, sheet.url)}
                  disabled={loading}
                  className='ml-3 shrink-0'
                >
                  {loading ? <Icons.spinner className='h-4 w-4 animate-spin' /> : 'Sincronizar'}
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
