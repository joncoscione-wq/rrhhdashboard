'use client';

import { Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getEmpleadoById, getHomeOfficeEmpleado } from '@/features/legajo/api/service';
import { DocumentoUploader } from '@/features/documents/components/documento-uploader';
import {
  DocumentosTable,
  DocumentosTableSkeleton
} from '@/features/documents/components/documentos-table';
import { SectionFechaNacimiento } from './sections/section-fecha-nacimiento';
import { SectionCelular } from './sections/section-celular';
import { SectionEmergencia } from './sections/section-emergencia';
import { SectionPresencialidad } from './sections/section-presencialidad';
import { SectionEmail } from './sections/section-email';
import { SectionDireccion } from './sections/section-direccion';
import { SectionMovilidad } from './sections/section-movilidad';
import { SectionDatosLaborales } from './sections/section-datos-laborales';
import { VersionTimeline } from './version-timeline';

function initials(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export default function LegajoViewPage({ empleadoId }: { empleadoId: string }) {
  const queryClient = useQueryClient();
  const id = Number(empleadoId);

  const { data: empleado } = useQuery({
    queryKey: ['legajo', id],
    queryFn: () => getEmpleadoById(id)
  });

  const { data: homeOffice = [] } = useQuery({
    queryKey: ['legajo', id, 'home_office'],
    queryFn: () => getHomeOfficeEmpleado(id)
  });

  if (!empleado) notFound();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['legajo', id] });
  };

  return (
    <div className='space-y-6'>
      <div className='flex items-center gap-4'>
        <Avatar className='h-16 w-16'>
          <AvatarFallback className='text-lg'>{initials(empleado.nombre_apellido)}</AvatarFallback>
        </Avatar>
        <div>
          <h3 className='text-xl font-semibold'>{empleado.nombre_apellido}</h3>
          <p className='text-muted-foreground text-sm'>
            {empleado.puesto ?? empleado.equipo_ingreso ?? 'Sin equipo'}
          </p>
          <Badge
            variant='outline'
            className={
              empleado.activo
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-500/10 text-red-600 dark:text-red-400'
            }
          >
            {empleado.activo ? 'Activo' : 'Inactivo'}
          </Badge>
        </div>
      </div>

      <div className='grid gap-4 md:grid-cols-3'>
        <SectionFechaNacimiento empleadoId={id} fechaNacimiento={empleado.fecha_nacimiento} />
        <SectionCelular empleadoId={id} celular={empleado.celular} />
        <SectionEmergencia empleadoId={id} contactoEmergencia={empleado.contacto_emergencia} />
      </div>

      <div className='grid gap-4 md:grid-cols-1'>
        <SectionEmail empleadoId={id} email={empleado.email} />
      </div>

      <div className='grid gap-4 md:grid-cols-2'>
        <SectionDireccion empleadoId={id} direccion={empleado.direccion} />
        <SectionPresencialidad
          empleadoId={id}
          modalidad={empleado.modalidad}
          homeOffice={homeOffice}
          onDataChange={refresh}
        />
      </div>

      <div className='grid gap-4 md:grid-cols-1'>
        <SectionMovilidad empleadoId={id} movilidad={empleado.movilidad} />
      </div>

      <div className='grid gap-4 md:grid-cols-1'>
        <SectionDatosLaborales
          empleadoId={id}
          dni={empleado.dni}
          equipo_ingreso={empleado.equipo_ingreso}
          fecha_ingreso={empleado.fecha_ingreso}
          puesto={empleado.puesto}
        />
      </div>

      <div className='grid gap-4 md:grid-cols-1'>
        <div className='space-y-3'>
          <h4 className='text-sm font-semibold'>Documentos</h4>
          <DocumentoUploader empleadoIdFijo={id} />
          <Suspense fallback={<DocumentosTableSkeleton />}>
            <DocumentosTable empleadoId={id} />
          </Suspense>
        </div>
      </div>

      <div className='grid gap-4 md:grid-cols-1'>
        <div className='space-y-3'>
          <h4 className='text-sm font-semibold'>Historial de Versiones</h4>
          <VersionTimeline entidadTabla='empleados' entidadId={id} />
        </div>
      </div>
    </div>
  );
}
