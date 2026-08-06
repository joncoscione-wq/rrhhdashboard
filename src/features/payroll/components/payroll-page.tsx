'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { getSueldosByAnio, getAniosDisponibles } from '@/features/payroll/api/service';
import type { Sueldo, SueldosPorEmpleado } from '@/features/payroll/api/types';
import { SueldoDialog } from './sueldo-dialog';
import { SheetsImportButton } from '@/features/sheets/components/sheets-import-button';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatMonto(monto: number | null, moneda: 'PESOS ARG' | 'USD'): string {
  if (monto === null || monto === 0) return '—';
  const exacto = monto.toLocaleString('es-AR', { maximumFractionDigits: 2 });
  return moneda === 'USD' ? `U$D ${exacto}` : `$${exacto}`;
}

function buildPivot(sueldos: Sueldo[], moneda: 'PESOS ARG' | 'USD'): SueldosPorEmpleado[] {
  const map = new Map<string, (number | null)[]>();
  for (const s of sueldos) {
    if (s.moneda !== moneda) continue;
    const nombre = s.empleados?.nombre_apellido ?? `ID ${s.empleado_id}`;
    if (!map.has(nombre)) map.set(nombre, Array(12).fill(null));
    const arr = map.get(nombre)!;
    arr[s.mes - 1] = s.monto;
  }
  return Array.from(map.entries())
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([nombre_apellido, meses]) => ({ nombre_apellido, moneda, meses }));
}

type BonoRow = { nombre_apellido: string; bono_anual: number };

type BonosSection = {
  moneda: 'PESOS ARG' | 'USD';
  bonos: BonoRow[];
  total: number;
};

function buildBonos(sueldos: Sueldo[]): BonosSection[] {
  const map = new Map<'PESOS ARG' | 'USD', BonoRow[]>();
  map.set('PESOS ARG', []);
  map.set('USD', []);
  for (const s of sueldos) {
    if (s.bono_anual === null || s.bono_anual === 0) continue;
    const nombre = s.empleados?.nombre_apellido ?? `ID ${s.empleado_id}`;
    map.get(s.moneda)!.push({ nombre_apellido: nombre, bono_anual: s.bono_anual });
  }
  const sections: BonosSection[] = [];
  for (const [moneda, bonos] of map) {
    if (bonos.length === 0) continue;
    bonos.sort((a, b) => a.nombre_apellido.localeCompare(b.nombre_apellido));
    const total = bonos.reduce((acc, b) => acc + b.bono_anual, 0);
    sections.push({ moneda, bonos, total });
  }
  return sections;
}

function SueldoTable({
  rows,
  moneda
}: {
  rows: SueldosPorEmpleado[];
  moneda: 'PESOS ARG' | 'USD';
}) {
  return (
    <div className='overflow-x-auto'>
      <table className='w-full text-sm'>
        <thead>
          <tr className='border-b'>
            <th className='px-4 py-2 text-left font-medium text-muted-foreground min-w-[180px]'>
              Empleado
            </th>
            {MESES.map((m) => (
              <th
                key={m}
                className='px-2 py-2 text-right font-medium text-muted-foreground min-w-[80px]'
              >
                {m}
              </th>
            ))}
            <th className='px-3 py-2 text-right font-medium text-muted-foreground min-w-[80px]'>
              Último
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const ultimo = [...row.meses].toReversed().find((v) => v !== null) ?? null;
            return (
              <tr key={row.nombre_apellido} className='border-b last:border-0 hover:bg-muted/30'>
                <td className='px-4 py-2 font-medium'>{row.nombre_apellido}</td>
                {row.meses.map((monto, i) => (
                  <td
                    key={i}
                    className={`px-2 py-2 text-right tabular-nums ${
                      monto === null ? 'text-muted-foreground/40' : ''
                    }`}
                  >
                    {monto !== null ? formatMonto(monto, moneda) : '·'}
                  </td>
                ))}
                <td className='px-3 py-2 text-right font-semibold tabular-nums'>
                  {formatMonto(ultimo, moneda)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BonosTable({ sections }: { sections: BonosSection[] }) {
  return (
    <div className='overflow-x-auto'>
      <table className='w-full text-sm'>
        <thead>
          <tr className='border-b'>
            <th className='px-4 py-2 text-left font-medium text-muted-foreground min-w-[200px]'>
              Empleado
            </th>
            <th className='px-4 py-2 text-right font-medium text-muted-foreground min-w-[120px]'>
              Bono Anual
            </th>
            <th className='px-4 py-2 text-right font-medium text-muted-foreground min-w-[80px]'>
              Moneda
            </th>
          </tr>
        </thead>
        <tbody>
          {sections.map((section) =>
            section.bonos.map((bono) => (
              <tr
                key={`${section.moneda}-${bono.nombre_apellido}`}
                className='border-b last:border-0 hover:bg-muted/30'
              >
                <td className='px-4 py-2 font-medium'>{bono.nombre_apellido}</td>
                <td className='px-4 py-2 text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400'>
                  {formatMonto(bono.bono_anual, section.moneda)}
                </td>
                <td className='px-4 py-2 text-right tabular-nums text-muted-foreground'>
                  {section.moneda === 'PESOS ARG' ? 'ARS' : 'USD'}
                </td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          {sections.map((section) => (
            <tr key={`total-${section.moneda}`} className='border-t font-semibold'>
              <td className='px-4 py-2'>Total {section.moneda === 'PESOS ARG' ? 'ARS' : 'USD'}</td>
              <td className='px-4 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400'>
                {formatMonto(section.total, section.moneda)}
              </td>
              <td className='px-4 py-2 text-right text-muted-foreground'>
                {section.moneda === 'PESOS ARG' ? 'ARS' : 'USD'}
              </td>
            </tr>
          ))}
        </tfoot>
      </table>
    </div>
  );
}

export function PayrollPage() {
  const [anio, setAnio] = useState<number>(2025);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: anios = [] } = useQuery({
    queryKey: ['payroll', 'anios'],
    queryFn: getAniosDisponibles
  });

  const { data: sueldos = [], isLoading } = useQuery({
    queryKey: ['payroll', 'sueldos', anio],
    queryFn: () => getSueldosByAnio(anio)
  });

  const pesos = buildPivot(sueldos, 'PESOS ARG');
  const usd = buildPivot(sueldos, 'USD');
  const bonosSections = buildBonos(sueldos);

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-3'>
        <div className='flex items-center gap-3'>
          <span className='text-sm text-muted-foreground'>Período:</span>
          <Select value={String(anio)} onValueChange={(v) => setAnio(Number(v))}>
            <SelectTrigger className='w-[100px]'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {anios.map((a) => (
                <SelectItem key={a} value={String(a)}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='flex items-center gap-2'>
          <SheetsImportButton />
          <Button size='sm' onClick={() => setDialogOpen(true)}>
            <Icons.circleCheck className='mr-2 h-4 w-4' />
            Cargar / editar sueldo
          </Button>
        </div>
      </div>

      <SueldoDialog open={dialogOpen} onOpenChange={setDialogOpen} anio={anio} />

      {isLoading ? (
        <p className='text-muted-foreground text-sm italic'>Cargando...</p>
      ) : sueldos.length === 0 ? (
        <p className='text-muted-foreground text-sm italic'>Sin datos para {anio}.</p>
      ) : (
        <Accordion type='multiple' defaultValue={['bonos']}>
          {pesos.length > 0 && (
            <AccordionItem value='pesos' className='border rounded-lg mb-3'>
              <AccordionTrigger className='px-4 py-3 hover:bg-muted/30 hover:no-underline rounded-t-lg [&[data-state=open]]:rounded-b-none [&[data-state=open]]:border-b'>
                <div className='flex items-center gap-3'>
                  <span className='text-base font-semibold'>Pesos Argentinos</span>
                  <Badge variant='outline' className='text-xs'>
                    {pesos.length} empleados
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className='p-0'>
                <SueldoTable rows={pesos} moneda='PESOS ARG' />
              </AccordionContent>
            </AccordionItem>
          )}

          {usd.length > 0 && (
            <AccordionItem value='usd' className='border rounded-lg mb-3'>
              <AccordionTrigger className='px-4 py-3 hover:bg-muted/30 hover:no-underline rounded-t-lg [&[data-state=open]]:rounded-b-none [&[data-state=open]]:border-b'>
                <div className='flex items-center gap-3'>
                  <span className='text-base font-semibold'>Dólares (USD)</span>
                  <Badge variant='outline' className='text-xs'>
                    {usd.length} empleados
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className='p-0'>
                <SueldoTable rows={usd} moneda='USD' />
              </AccordionContent>
            </AccordionItem>
          )}

          {bonosSections.length > 0 && (
            <AccordionItem value='bonos' className='border rounded-lg'>
              <AccordionTrigger className='px-4 py-3 hover:bg-muted/30 hover:no-underline rounded-t-lg [&[data-state=open]]:rounded-b-none [&[data-state=open]]:border-b'>
                <div className='flex items-center gap-3'>
                  <span className='text-base font-semibold'>Bonos Anuales</span>
                  <Badge
                    variant='secondary'
                    className='text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  >
                    {bonosSections.reduce((acc, s) => acc + s.bonos.length, 0)} empleados
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className='p-0'>
                <BonosTable sections={bonosSections} />
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      )}
    </div>
  );
}
