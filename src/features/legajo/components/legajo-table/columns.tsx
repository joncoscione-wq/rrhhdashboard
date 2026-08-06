'use client';

import type { ColumnDef, Table } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icons } from '@/components/icons';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import type { Empleado } from '@/features/legajo/api/types';
import { parseContactoEmergencia } from '@/features/legajo/api/service';

const SIN_INFO = (
  <span className='text-muted-foreground italic text-xs'>Sin informaci&oacute;n</span>
);

type TableMeta = {
  editingId: number | null;
  editData: Partial<Empleado>;
  startEdit: (id: number) => void;
  saveEdit: () => Promise<void>;
  cancelEdit: () => void;
  updateEditData: (key: string, value: unknown) => void;
  archiveEmpleado: (emp: Empleado) => void;
  requestDeleteEmpleado: (emp: Empleado) => void;
};

function getMeta(table: Table<Empleado>): TableMeta {
  return table.options.meta as TableMeta;
}

function initials(nombreApellido: string): string {
  const parts = nombreApellido.split(/[\s,]+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

const modalidadColors: Record<string, string> = {
  home_office: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  presencial: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  hibrido: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  'n/a': 'bg-gray-500/10 text-gray-600 dark:text-gray-400'
};

const modalidadLabels: Record<string, string> = {
  home_office: 'Home Office',
  presencial: 'Presencial',
  hibrido: 'Híbrido',
  'n/a': 'N/A'
};

export const columns: ColumnDef<Empleado>[] = [
  {
    id: 'nombre_apellido',
    accessorKey: 'nombre_apellido',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Nombre' />,
    cell: ({ row, table }) => {
      const meta = getMeta(table);
      if (meta.editingId === row.original.id) {
        return (
          <Input
            value={meta.editData.nombre_apellido ?? ''}
            onChange={(e) => meta.updateEditData('nombre_apellido', e.target.value)}
            className='h-7 text-xs'
          />
        );
      }
      const emp = row.original;
      return (
        <div className='flex items-center gap-1.5'>
          <Avatar className='h-6 w-6'>
            <AvatarFallback className='text-[10px]'>{initials(emp.nombre_apellido)}</AvatarFallback>
          </Avatar>
          <div className='flex flex-col leading-tight'>
            <span className='text-xs font-medium'>{emp.nombre_apellido}</span>
            <span className='text-muted-foreground text-[10px]'>{emp.email ?? 'Sin email'}</span>
          </div>
        </div>
      );
    },
    enableColumnFilter: true,
    meta: { label: 'Nombre', placeholder: 'Buscar...', variant: 'text' }
  },
  {
    id: 'dni',
    accessorKey: 'dni',
    header: ({ column }) => <DataTableColumnHeader column={column} title='DNI' />,
    cell: ({ row, table }) => {
      const meta = getMeta(table);
      if (meta.editingId === row.original.id) {
        return (
          <Input
            value={meta.editData.dni ?? ''}
            onChange={(e) => meta.updateEditData('dni', e.target.value)}
            className='h-7 text-xs'
          />
        );
      }
      return <span className='text-xs'>{row.original.dni ?? SIN_INFO}</span>;
    },
    enableColumnFilter: true,
    meta: { label: 'DNI', placeholder: 'Buscar...', variant: 'text' }
  },
  {
    id: 'equipo_ingreso',
    accessorKey: 'equipo_ingreso',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Equipo' />,
    cell: ({ row, table }) => {
      const meta = getMeta(table);
      if (meta.editingId === row.original.id) {
        return (
          <Input
            value={meta.editData.equipo_ingreso ?? ''}
            onChange={(e) => meta.updateEditData('equipo_ingreso', e.target.value)}
            className='h-7 text-xs'
          />
        );
      }
      return <span className='text-xs'>{row.original.equipo_ingreso ?? SIN_INFO}</span>;
    },
    enableColumnFilter: true,
    meta: { label: 'Equipo', placeholder: 'Filtrar...', variant: 'text' }
  },
  {
    id: 'fecha_ingreso',
    accessorKey: 'fecha_ingreso',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Ingreso' />,
    cell: ({ row, table }) => {
      const meta = getMeta(table);
      if (meta.editingId === row.original.id) {
        return (
          <Input
            type='date'
            value={meta.editData.fecha_ingreso ?? ''}
            onChange={(e) => meta.updateEditData('fecha_ingreso', e.target.value)}
            className='h-7 text-xs'
          />
        );
      }
      const val = row.original.fecha_ingreso;
      if (!val) return SIN_INFO;
      return (
        <span className='text-xs'>
          {new Date(val + 'T00:00:00').toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          })}
        </span>
      );
    },
    enableColumnFilter: true,
    meta: { label: 'Ingreso', variant: 'text' }
  },
  {
    id: 'activo',
    accessorKey: 'activo',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Estado' />,
    cell: ({ row, table }) => {
      const meta = getMeta(table);
      const isEditing = meta.editingId === row.original.id;
      const activo = isEditing ? meta.editData.activo : row.original.activo;
      if (isEditing) {
        return (
          <select
            value={activo ? 'true' : 'false'}
            onChange={(e) => meta.updateEditData('activo', e.target.value === 'true')}
            className='h-7 rounded border px-2 text-xs'
          >
            <option value='true'>Activo</option>
            <option value='false'>Inactivo</option>
          </select>
        );
      }
      return (
        <Badge
          variant='outline'
          className={
            activo
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-slate-500/10 text-slate-500 dark:text-slate-400'
          }
        >
          {activo ? 'Activo' : 'Inactivo'}
        </Badge>
      );
    },
    enableColumnFilter: true,
    meta: { label: 'Estado', variant: 'text' }
  },
  {
    id: 'modalidad',
    accessorKey: 'modalidad',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Modalidad' />,
    cell: ({ row, table }) => {
      const meta = getMeta(table);
      const isEditing = meta.editingId === row.original.id;
      const modalidad = isEditing ? meta.editData.modalidad : row.original.modalidad;
      if (isEditing) {
        return (
          <select
            value={modalidad}
            onChange={(e) => meta.updateEditData('modalidad', e.target.value)}
            className='h-7 rounded border px-2 text-xs'
          >
            <option value='home_office'>Home Office</option>
            <option value='presencial'>Presencial</option>
            <option value='hibrido'>Híbrido</option>
            <option value='n/a'>N/A</option>
          </select>
        );
      }
      return (
        <Badge variant='outline' className={modalidadColors[modalidad ?? ''] ?? ''}>
          {modalidadLabels[modalidad ?? ''] ?? modalidad}
        </Badge>
      );
    },
    enableColumnFilter: true,
    meta: { label: 'Modalidad', variant: 'text' }
  },
  {
    id: 'fecha_nacimiento',
    accessorKey: 'fecha_nacimiento',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Nacimiento' />,
    cell: ({ row, table }) => {
      const meta = getMeta(table);
      if (meta.editingId === row.original.id) {
        return (
          <Input
            type='date'
            value={meta.editData.fecha_nacimiento ?? ''}
            onChange={(e) => meta.updateEditData('fecha_nacimiento', e.target.value)}
            className='h-7 text-xs'
          />
        );
      }
      const val = row.original.fecha_nacimiento;
      if (!val) return SIN_INFO;
      return (
        <span className='text-xs'>
          {new Date(val + 'T00:00:00').toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          })}
        </span>
      );
    },
    enableColumnFilter: false,
    meta: { label: 'Nacimiento', variant: 'text' }
  },
  {
    id: 'celular',
    accessorKey: 'celular',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Celular' />,
    cell: ({ row, table }) => {
      const meta = getMeta(table);
      if (meta.editingId === row.original.id) {
        return (
          <Input
            value={meta.editData.celular ?? ''}
            onChange={(e) => meta.updateEditData('celular', e.target.value)}
            className='h-7 text-xs'
          />
        );
      }
      return <span className='text-xs'>{row.original.celular ?? SIN_INFO}</span>;
    },
    enableColumnFilter: false,
    meta: { label: 'Celular', variant: 'text' }
  },
  {
    id: 'contacto_emergencia',
    accessorKey: 'contacto_emergencia',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Emergencia' />,
    cell: ({ row, table }) => {
      const meta = getMeta(table);
      if (meta.editingId === row.original.id) {
        return (
          <Input
            value={meta.editData.contacto_emergencia ?? ''}
            onChange={(e) => meta.updateEditData('contacto_emergencia', e.target.value)}
            className='h-7 text-xs'
          />
        );
      }
      const contacto = row.original.contacto_emergencia;
      if (!contacto) return SIN_INFO;
      const parsed = parseContactoEmergencia(contacto);
      if (parsed) {
        return (
          <span className='text-xs'>
            {parsed.telefono && <span className='font-medium'>{parsed.telefono}</span>}
            {parsed.nombre && <span className='text-muted-foreground'> · {parsed.nombre}</span>}
            {parsed.parentesco && (
              <span className='text-muted-foreground'> ({parsed.parentesco})</span>
            )}
          </span>
        );
      }
      return <span className='text-xs truncate max-w-[120px]'>{contacto}</span>;
    },
    enableColumnFilter: false,
    meta: { label: 'Emergencia', variant: 'text' }
  },
  {
    id: 'direccion',
    accessorKey: 'direccion',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Dirección' />,
    cell: ({ row, table }) => {
      const meta = getMeta(table);
      if (meta.editingId === row.original.id) {
        return (
          <Input
            value={meta.editData.direccion ?? ''}
            onChange={(e) => meta.updateEditData('direccion', e.target.value)}
            className='h-7 text-xs'
          />
        );
      }
      const val = row.original.direccion;
      if (!val) return SIN_INFO;
      return <span className='text-xs truncate max-w-[120px] inline-block'>{val}</span>;
    },
    enableColumnFilter: false,
    meta: { label: 'Dirección', variant: 'text' }
  },
  {
    id: 'movilidad',
    accessorKey: 'movilidad',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Movilidad' />,
    cell: ({ row, table }) => {
      const meta = getMeta(table);
      if (meta.editingId === row.original.id) {
        return (
          <Input
            value={meta.editData.movilidad ?? ''}
            onChange={(e) => meta.updateEditData('movilidad', e.target.value)}
            className='h-7 text-xs'
          />
        );
      }
      return <span className='text-xs'>{row.original.movilidad ?? SIN_INFO}</span>;
    },
    enableColumnFilter: false,
    meta: { label: 'Movilidad', variant: 'text' }
  },
  {
    id: 'puesto',
    accessorKey: 'puesto',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Puesto' />,
    cell: ({ row, table }) => {
      const meta = getMeta(table);
      if (meta.editingId === row.original.id) {
        return (
          <Input
            value={meta.editData.puesto ?? ''}
            onChange={(e) => meta.updateEditData('puesto', e.target.value)}
            className='h-7 text-xs'
          />
        );
      }
      return <span className='text-xs font-medium'>{row.original.puesto ?? SIN_INFO}</span>;
    },
    enableColumnFilter: false,
    meta: { label: 'Puesto', variant: 'text' }
  },
  {
    id: 'actions',
    cell: ({ row, table }) => {
      const meta = getMeta(table);
      const isEditing = meta.editingId === row.original.id;
      if (isEditing) {
        return (
          <div className='flex gap-1'>
            <Button variant='ghost' size='icon' className='h-8 w-8' onClick={meta.saveEdit}>
              <Icons.check className='h-4 w-4' />
            </Button>
            <Button variant='ghost' size='icon' className='h-8 w-8' onClick={meta.cancelEdit}>
              <Icons.close className='h-4 w-4' />
            </Button>
          </div>
        );
      }
      return (
        <div className='flex items-center gap-1'>
          <Button
            variant='ghost'
            className='h-8 w-8 p-0'
            onClick={() => meta.startEdit(row.original.id)}
          >
            <Icons.edit className='h-4 w-4' />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' className='h-8 w-8 p-0'>
                <Icons.ellipsis className='h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={() => meta.archiveEmpleado(row.original)}>
                {row.original.activo ? (
                  <>
                    <Icons.employee className='mr-2 h-4 w-4' />
                    Archivar
                  </>
                ) : (
                  <>
                    <Icons.refresh className='mr-2 h-4 w-4' />
                    Restaurar
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className='text-destructive focus:text-destructive'
                onClick={() => meta.requestDeleteEmpleado(row.original)}
              >
                <Icons.trash className='mr-2 h-4 w-4' />
                Eliminar definitivamente
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    }
  }
];
