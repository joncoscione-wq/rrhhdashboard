'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Icons } from '@/components/icons';
import { toast } from 'sonner';
import {
  getEmpleadosParaSueldo,
  getSueldosByAnio,
  upsertSueldo,
  deleteSueldoByKey
} from '../api/service';
import { showUndoToast } from '@/lib/undo-toast';
import type { SueldoInput } from '../api/types';

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre'
];

function buildEmpty(anio: number): SueldoInput {
  return {
    empleado_id: 0,
    empresa_id: 1,
    moneda: 'PESOS ARG',
    mes: new Date().getMonth() + 1,
    anio,
    monto: null,
    bono_anual: null
  };
}

interface SueldoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anio: number;
}

export function SueldoDialog({ open, onOpenChange, anio }: SueldoDialogProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SueldoInput>(() => buildEmpty(anio));
  const [loading, setLoading] = useState(false);

  const { data: empleados = [] } = useQuery({
    queryKey: ['payroll', 'empleados'],
    queryFn: getEmpleadosParaSueldo,
    enabled: open
  });

  const { data: sueldosDelAnio = [] } = useQuery({
    queryKey: ['payroll', 'sueldos', anio],
    queryFn: () => getSueldosByAnio(anio),
    enabled: open
  });

  useEffect(() => {
    if (open) setForm(buildEmpty(anio));
  }, [open, anio]);

  // Precarga los montos ya cargados para ese empleado/mes/moneda. La moneda es
  // parte de la clave: un empleado puede tener sueldo en PESOS ARG y en USD el
  // mismo mes, así que cambiar de moneda tiene que traer la otra fila.
  useEffect(() => {
    if (!form.empleado_id) return;
    const existente = sueldosDelAnio.find(
      (s) => s.empleado_id === form.empleado_id && s.mes === form.mes && s.moneda === form.moneda
    );
    setForm((prev) => ({
      ...prev,
      monto: existente ? existente.monto : null,
      bono_anual: existente ? existente.bono_anual : null
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.empleado_id, form.mes, form.moneda, sueldosDelAnio]);

  const set = <K extends keyof SueldoInput>(key: K, value: SueldoInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleClose = () => {
    setForm(buildEmpty(anio));
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!form.empleado_id) {
      toast.error('Seleccioná un empleado');
      return;
    }
    // Sin la moneda, el deshacer restauraba la fila de la otra moneda del mismo mes
    const existente = sueldosDelAnio.find(
      (s) => s.empleado_id === form.empleado_id && s.mes === form.mes && s.moneda === form.moneda
    );
    setLoading(true);
    try {
      await upsertSueldo(form);
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      handleClose();
      showUndoToast('Sueldo guardado correctamente', async () => {
        if (existente) {
          await upsertSueldo({
            empleado_id: existente.empleado_id,
            empresa_id: form.empresa_id,
            moneda: existente.moneda,
            mes: existente.mes,
            anio: existente.anio,
            monto: existente.monto,
            bono_anual: existente.bono_anual
          });
        } else {
          await deleteSueldoByKey(form.empleado_id, form.mes, form.anio, form.moneda);
        }
        queryClient.invalidateQueries({ queryKey: ['payroll'] });
      });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className='max-w-lg'>
        <DialogHeader>
          <DialogTitle>Cargar / editar sueldo</DialogTitle>
        </DialogHeader>

        <div className='grid grid-cols-2 gap-4 py-2'>
          <div className='col-span-2 space-y-1.5'>
            <Label className='text-xs'>Empleado</Label>
            <select
              value={form.empleado_id}
              onChange={(e) => set('empleado_id', Number(e.target.value))}
              className='h-8 w-full rounded-md border bg-background px-2 text-xs'
            >
              <option value={0}>Seleccionar...</option>
              {empleados.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nombre_apellido}
                </option>
              ))}
            </select>
          </div>

          <div className='space-y-1.5'>
            <Label className='text-xs'>Mes</Label>
            <select
              value={form.mes}
              onChange={(e) => set('mes', Number(e.target.value))}
              className='h-8 w-full rounded-md border bg-background px-2 text-xs'
            >
              {MESES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className='space-y-1.5'>
            <Label className='text-xs'>Año</Label>
            <Input
              type='number'
              value={form.anio}
              onChange={(e) => set('anio', Number(e.target.value))}
              className='h-8 text-xs'
            />
          </div>

          <div className='space-y-1.5'>
            <Label className='text-xs'>Moneda</Label>
            <select
              value={form.moneda}
              onChange={(e) => set('moneda', e.target.value as SueldoInput['moneda'])}
              className='h-8 w-full rounded-md border bg-background px-2 text-xs'
            >
              <option value='PESOS ARG'>Pesos ARG</option>
              <option value='USD'>USD</option>
            </select>
          </div>
          <div className='space-y-1.5'>
            <Label className='text-xs'>Monto</Label>
            <Input
              type='number'
              value={form.monto ?? ''}
              onChange={(e) => set('monto', e.target.value === '' ? null : Number(e.target.value))}
              placeholder='0'
              className='h-8 text-xs'
            />
          </div>

          <div className='col-span-2 space-y-1.5'>
            <Label className='text-xs'>Bono anual (opcional)</Label>
            <Input
              type='number'
              value={form.bono_anual ?? ''}
              onChange={(e) =>
                set('bono_anual', e.target.value === '' ? null : Number(e.target.value))
              }
              placeholder='0'
              className='h-8 text-xs'
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' size='sm' onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button size='sm' onClick={handleSubmit} disabled={loading}>
            {loading ? (
              <>
                <Icons.spinner className='mr-2 h-4 w-4 animate-spin' /> Guardando...
              </>
            ) : (
              'Guardar sueldo'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
