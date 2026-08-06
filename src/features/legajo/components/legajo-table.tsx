'use client';

import { useState, useMemo } from 'react';
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { parseAsInteger, useQueryStates } from 'nuqs';
import { getSortingStateParser } from '@/lib/parsers';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTable } from '@/components/ui/table/data-table';
import { Input } from '@/components/ui/input';
import { Icons } from '@/components/icons';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { showUndoToast } from '@/lib/undo-toast';
import { columns } from './legajo-table/columns';
import {
  getEmpleados,
  updateEmpleado,
  upsertPuesto,
  setEmpleadoActivo,
  deleteEmpleado
} from '../api/service';
import type { Empleado } from '../api/types';

type VistaLegajo = 'activos' | 'archivados' | 'todos';

export function LegajoTable() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');

  const [params] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    perPage: parseAsInteger.withDefault(50),
    sort: getSortingStateParser([
      'nombre_apellido',
      'dni',
      'equipo_ingreso',
      'fecha_ingreso',
      'modalidad',
      'activo'
    ]).withDefault([])
  });

  const filters = {
    page: params.page,
    limit: params.perPage,
    ...(params.sort.length > 0 && { sort: JSON.stringify(params.sort) })
  };

  const { data } = useSuspenseQuery({
    queryKey: ['legajo', filters],
    queryFn: () => getEmpleados(filters)
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<Partial<Empleado>>({});
  const [vista, setVista] = useState<VistaLegajo>('activos');
  const [deleteTarget, setDeleteTarget] = useState<Empleado | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Archivar/restaurar (baja lógica) con deshacer
  const archiveEmpleado = async (emp: Empleado) => {
    const nuevoEstado = !emp.activo;
    try {
      await setEmpleadoActivo(emp.id, nuevoEstado);
      queryClient.invalidateQueries({ queryKey: ['legajo'] });
      showUndoToast(nuevoEstado ? 'Legajo restaurado' : 'Legajo archivado', async () => {
        await setEmpleadoActivo(emp.id, emp.activo);
        queryClient.invalidateQueries({ queryKey: ['legajo'] });
      });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar el legajo');
    }
  };

  // Eliminar físico (CASCADE borra sueldos/vacaciones/líneas): solo con confirmación
  const confirmDeleteEmpleado = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteEmpleado(deleteTarget.id);
      queryClient.invalidateQueries({ queryKey: ['legajo'] });
      toast.success(`Legajo de ${deleteTarget.nombre_apellido} eliminado definitivamente`);
      setDeleteTarget(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar el legajo');
    } finally {
      setDeleting(false);
    }
  };

  const startEdit = (id: number) => {
    const emp = data.items.find((e: Empleado) => e.id === id);
    if (!emp) return;
    setEditingId(id);
    setEditData({ ...emp });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const fields: (keyof Empleado)[] = [
      'nombre_apellido',
      'dni',
      'celular',
      'email',
      'direccion',
      'movilidad',
      'equipo_ingreso',
      'modalidad',
      'fecha_nacimiento',
      'fecha_ingreso',
      'activo',
      'contacto_emergencia'
    ];
    const original = data.items.find((e: Empleado) => e.id === editingId);
    const toUpdate: Record<string, unknown> = {};
    for (const f of fields) {
      if (f in editData) {
        toUpdate[f] = editData[f] === '' ? null : editData[f];
      }
    }
    const originalPuesto = original?.puesto;
    try {
      await updateEmpleado(editingId, toUpdate as Parameters<typeof updateEmpleado>[1]);
      if ('puesto' in editData) {
        await upsertPuesto(editingId, editData.puesto ?? null);
      }
      queryClient.invalidateQueries({ queryKey: ['legajo'] });
      const id = editingId;
      setEditingId(null);
      setEditData({});
      showUndoToast('Empleado actualizado', async () => {
        if (original) {
          const revert: Record<string, unknown> = {};
          for (const f of fields) revert[f] = original[f] ?? null;
          await updateEmpleado(id, revert as Parameters<typeof updateEmpleado>[1]);
          await upsertPuesto(id, originalPuesto ?? null);
          queryClient.invalidateQueries({ queryKey: ['legajo'] });
        }
      });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar');
    }
  };

  const updateEditData = (key: string, value: unknown) => {
    setEditData((prev) => ({ ...prev, [key]: value }));
  };

  const filtered = useMemo(() => {
    let items = data.items;
    // Vista: por defecto solo activos; los archivados quedan a un toque
    if (vista === 'activos') items = items.filter((e: Empleado) => e.activo);
    else if (vista === 'archivados') items = items.filter((e: Empleado) => !e.activo);
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((e: Empleado) =>
      [e.nombre_apellido, e.dni, e.equipo_ingreso, e.puesto, e.email].some((v) =>
        v?.toLowerCase().includes(q)
      )
    );
  }, [data.items, search, vista]);

  const { table } = useDataTable({
    data: filtered,
    columns,
    pageCount: Math.ceil(filtered.length / params.perPage),
    shallow: true,
    debounceMs: 500,
    initialState: {
      columnPinning: { left: ['nombre_apellido'], right: ['actions'] }
    },
    meta: {
      editingId,
      editData,
      startEdit,
      saveEdit,
      cancelEdit,
      updateEditData,
      archiveEmpleado,
      requestDeleteEmpleado: setDeleteTarget
    }
  });

  return (
    <div className='flex flex-1 flex-col space-y-3'>
      <div className='flex items-center gap-2 flex-wrap'>
        <div className='relative max-w-sm flex-1 min-w-[220px]'>
          <Icons.search className='text-muted-foreground absolute left-2.5 top-2.5 h-4 w-4' />
          <Input
            placeholder='Buscar por nombre, DNI, equipo, puesto...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='pl-8'
          />
        </div>
        <div className='flex items-center gap-1 rounded-full border p-0.5'>
          {(
            [
              ['activos', 'Activos'],
              ['archivados', 'Archivados'],
              ['todos', 'Todos']
            ] as [VistaLegajo, string][]
          ).map(([v, label]) => (
            <Button
              key={v}
              variant='ghost'
              size='sm'
              onClick={() => setVista(v)}
              className={`h-7 rounded-full px-3 text-xs ${
                vista === v ? 'bg-primary text-primary-foreground hover:bg-primary' : ''
              }`}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <DataTable table={table} />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title='¿Eliminar legajo definitivamente?'
        description={`Se eliminará el legajo de ${deleteTarget?.nombre_apellido ?? ''} junto con TODO su historial (sueldos, vacaciones, líneas, home office). Esta acción no se puede deshacer. Si solo querés darlo de baja, usá "Archivar".`}
        confirmLabel='Eliminar definitivamente'
        onConfirm={confirmDeleteEmpleado}
        loading={deleting}
        destructive
      />
    </div>
  );
}

export function LegajoTableSkeleton() {
  return (
    <div className='space-y-4 p-4'>
      <Skeleton className='h-10 w-full' />
      <Skeleton className='h-96 w-full' />
    </div>
  );
}
