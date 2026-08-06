'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
import { createEmpleado } from '../api/service';
import type { CreateEmpleadoInput } from '../api/types';

const EMPTY_FORM: CreateEmpleadoInput = {
  empresa_id: 1,
  nombre_apellido: '',
  dni: null,
  fecha_nacimiento: null,
  celular: null,
  email: null,
  direccion: null,
  movilidad: null,
  equipo_ingreso: null,
  fecha_ingreso: null,
  modalidad: 'presencial',
  contacto_emergencia: null,
  puesto: null
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateEmpleadoDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateEmpleadoInput>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);

  const set = <K extends keyof CreateEmpleadoInput>(key: K, value: CreateEmpleadoInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleClose = () => {
    setForm(EMPTY_FORM);
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!form.nombre_apellido.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    setLoading(true);
    try {
      const nuevoId = await createEmpleado(form);
      queryClient.invalidateQueries({ queryKey: ['empleados'] });
      toast.success('Empleado creado correctamente', {
        action: {
          label: 'Ver detalle',
          onClick: () => {
            window.location.href = `/dashboard/legajo/${nuevoId}`;
          }
        }
      });
      handleClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al crear empleado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className='max-w-lg max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Nuevo Legajo</DialogTitle>
        </DialogHeader>

        <div className='grid grid-cols-2 gap-3 py-2'>
          <div className='col-span-2 space-y-1.5'>
            <Label className='text-xs'>Nombre completo *</Label>
            <Input
              value={form.nombre_apellido}
              onChange={(e) => set('nombre_apellido', e.target.value)}
              placeholder='Nombre y apellido'
              className='h-8 text-xs'
            />
          </div>

          <div className='space-y-1.5'>
            <Label className='text-xs'>DNI</Label>
            <Input
              value={form.dni ?? ''}
              onChange={(e) => set('dni', e.target.value || null)}
              placeholder='Sin DNI'
              className='h-8 text-xs'
            />
          </div>
          <div className='space-y-1.5'>
            <Label className='text-xs'>F. Nacimiento</Label>
            <Input
              type='date'
              value={form.fecha_nacimiento ?? ''}
              onChange={(e) => set('fecha_nacimiento', e.target.value || null)}
              className='h-8 text-xs'
            />
          </div>

          <div className='space-y-1.5'>
            <Label className='text-xs'>Celular</Label>
            <Input
              value={form.celular ?? ''}
              onChange={(e) => set('celular', e.target.value || null)}
              placeholder='Sin celular'
              className='h-8 text-xs'
            />
          </div>
          <div className='space-y-1.5'>
            <Label className='text-xs'>Email</Label>
            <Input
              type='email'
              value={form.email ?? ''}
              onChange={(e) => set('email', e.target.value || null)}
              placeholder='Sin email'
              className='h-8 text-xs'
            />
          </div>

          <div className='col-span-2 space-y-1.5'>
            <Label className='text-xs'>Dirección</Label>
            <Input
              value={form.direccion ?? ''}
              onChange={(e) => set('direccion', e.target.value || null)}
              placeholder='Sin dirección'
              className='h-8 text-xs'
            />
          </div>

          <div className='space-y-1.5'>
            <Label className='text-xs'>Equipo</Label>
            <Input
              value={form.equipo_ingreso ?? ''}
              onChange={(e) => set('equipo_ingreso', e.target.value || null)}
              placeholder='Sin equipo'
              className='h-8 text-xs'
            />
          </div>
          <div className='space-y-1.5'>
            <Label className='text-xs'>F. Ingreso</Label>
            <Input
              type='date'
              value={form.fecha_ingreso ?? ''}
              onChange={(e) => set('fecha_ingreso', e.target.value || null)}
              className='h-8 text-xs'
            />
          </div>

          <div className='space-y-1.5'>
            <Label className='text-xs'>Modalidad</Label>
            <select
              value={form.modalidad}
              onChange={(e) => set('modalidad', e.target.value as CreateEmpleadoInput['modalidad'])}
              className='h-8 w-full rounded-md border bg-background px-2 text-xs'
            >
              <option value='presencial'>Presencial</option>
              <option value='home_office'>Home Office</option>
              <option value='hibrido'>Híbrido</option>
              <option value='n/a'>N/A</option>
            </select>
          </div>
          <div className='space-y-1.5'>
            <Label className='text-xs'>Movilidad</Label>
            <Input
              value={form.movilidad ?? ''}
              onChange={(e) => set('movilidad', e.target.value || null)}
              placeholder='Sin dato'
              className='h-8 text-xs'
            />
          </div>

          <div className='col-span-2 space-y-1.5'>
            <Label className='text-xs'>Contacto de emergencia</Label>
            <Input
              value={form.contacto_emergencia ?? ''}
              onChange={(e) => set('contacto_emergencia', e.target.value || null)}
              placeholder='Teléfono I Nombre Parentesco'
              className='h-8 text-xs'
            />
          </div>

          <div className='col-span-2 space-y-1.5'>
            <Label className='text-xs'>Puesto</Label>
            <Input
              value={form.puesto ?? ''}
              onChange={(e) => set('puesto', e.target.value || null)}
              placeholder='Sin puesto'
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
                <Icons.spinner className='mr-2 h-4 w-4 animate-spin' /> Creando...
              </>
            ) : (
              'Crear empleado'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
