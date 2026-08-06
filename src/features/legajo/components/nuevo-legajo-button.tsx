'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { CreateEmpleadoDialog } from './create-empleado-dialog';

export function NuevoLegajoButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size='sm' onClick={() => setOpen(true)}>
        <Icons.plusCircle className='mr-2 h-4 w-4' />
        Nuevo Legajo
      </Button>
      <CreateEmpleadoDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
