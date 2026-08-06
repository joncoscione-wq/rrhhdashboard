'use client';

import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Icons } from '@/components/icons';
import type { Documento, TipoArchivo, EtiquetaDocumento } from '@/features/documents/api/types';
import {
  softDeleteDocumento,
  restoreDocumento,
  purgeDocumentoStorage,
  formatTamanio,
  getDownloadUrl
} from '@/features/documents/api/service';
import { showUndoToast } from '@/lib/undo-toast';

const tipoIcon: Record<TipoArchivo, React.ReactNode> = {
  pdf: <Icons.fileTypePdf className='h-4 w-4 text-red-500 shrink-0' />,
  word: <Icons.fileTypeDoc className='h-4 w-4 text-blue-500 shrink-0' />,
  imagen: <Icons.page className='h-4 w-4 text-emerald-600 shrink-0' />
};

const tipoLabels: Record<string, string> = {
  contrato: 'Contrato',
  dni: 'DNI / Identificación',
  certificado: 'Certificado',
  otro: 'Otro'
};

const etiquetaColors: Record<EtiquetaDocumento, string> = {
  Legal: 'border-red-200 bg-red-50 text-red-700',
  Contable: 'border-blue-200 bg-blue-50 text-blue-700',
  RRHH: 'border-purple-200 bg-purple-50 text-purple-700',
  Contrato: 'border-amber-200 bg-amber-50 text-amber-700',
  Seguro: 'border-emerald-200 bg-emerald-50 text-emerald-700'
};

function ActionsCell({ documento }: { documento: Documento }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDownload = () => {
    if (!documento.storage_path) return;
    const url = getDownloadUrl(documento.storage_path);
    const a = document.createElement('a');
    a.href = url;
    a.download = documento.nombre_archivo ?? 'documento';
    a.click();
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await softDeleteDocumento(documento);
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['documentos'] });
      showUndoToast(
        `Documento eliminado: ${documento.nombre_archivo}`,
        async () => {
          await restoreDocumento(documento);
          queryClient.invalidateQueries({ queryKey: ['documentos'] });
        },
        () => {
          purgeDocumentoStorage(documento.storage_path);
        }
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='flex gap-1'>
      <Button
        variant='ghost'
        size='icon'
        className='h-8 w-8'
        onClick={handleDownload}
        title='Descargar'
      >
        <Icons.download className='h-4 w-4' />
      </Button>
      <Button
        variant='ghost'
        size='icon'
        className='h-8 w-8 text-destructive hover:text-destructive'
        onClick={() => setOpen(true)}
        title='Eliminar'
      >
        <Icons.trash className='h-4 w-4' />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title='¿Eliminar documento?'
        description={`Se eliminará "${documento.nombre_archivo}" y su archivo del servidor. Esta acción no se puede deshacer.`}
        confirmLabel='Eliminar'
        onConfirm={handleDelete}
        loading={loading}
        destructive
      />
    </div>
  );
}

export const columns: ColumnDef<Documento>[] = [
  {
    id: 'asociado',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Asociado a' />,
    cell: ({ row }) => {
      const d = row.original;
      if (d.linea_movil_numero) {
        return (
          <span className='text-sm'>
            <Icons.mobile className='mr-1 inline h-3 w-3 text-muted-foreground' />
            {d.linea_movil_numero}
          </span>
        );
      }
      if (d.laptop_descripcion) {
        return (
          <span className='text-sm'>
            <Icons.laptop className='mr-1 inline h-3 w-3 text-muted-foreground' />
            {d.laptop_descripcion}
          </span>
        );
      }
      return <span className='text-sm font-medium'>{d.empleado_nombre ?? '—'}</span>;
    },
    enableSorting: false
  },
  {
    id: 'etiqueta',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Etiqueta' />,
    cell: ({ row }) => {
      const e = row.original.etiqueta;
      if (!e) return <span className='text-xs text-muted-foreground'>—</span>;
      return (
        <Badge variant='outline' className={`text-xs ${etiquetaColors[e] ?? ''}`}>
          {e}
        </Badge>
      );
    },
    enableSorting: true
  },
  {
    id: 'tipo',
    accessorKey: 'tipo',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Tipo' />,
    cell: ({ row }) => {
      const { tipo, tipo_otro } = row.original;
      return (
        <Badge variant='outline' className='text-xs'>
          {tipo === 'otro' && tipo_otro ? tipo_otro : (tipoLabels[tipo] ?? tipo)}
        </Badge>
      );
    },
    enableSorting: true
  },
  {
    id: 'nombre_archivo',
    accessorKey: 'nombre_archivo',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Archivo' />,
    cell: ({ row }) => {
      const doc = row.original;
      const icon = doc.tipo_archivo ? (
        tipoIcon[doc.tipo_archivo]
      ) : (
        <Icons.page className='h-4 w-4 text-muted-foreground shrink-0' />
      );
      return (
        <div className='flex items-center gap-2 max-w-xs'>
          {icon}
          <span className='text-xs text-muted-foreground truncate'>
            {doc.nombre_archivo ?? '—'}
          </span>
        </div>
      );
    },
    enableSorting: false
  },
  {
    id: 'tamanio',
    accessorKey: 'tamanio',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Tamaño' />,
    cell: ({ row }) => (
      <span className='text-xs text-muted-foreground'>{formatTamanio(row.original.tamanio)}</span>
    ),
    enableSorting: false
  },
  {
    id: 'created_at',
    accessorKey: 'created_at',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Fecha' />,
    cell: ({ row }) => (
      <span className='text-xs text-muted-foreground'>
        {new Date(row.original.created_at).toLocaleDateString('es-AR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        })}
      </span>
    ),
    enableSorting: true
  },
  {
    id: 'actions',
    cell: ({ row }) => <ActionsCell documento={row.original} />
  }
];
