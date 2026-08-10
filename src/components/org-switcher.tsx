'use client';

import Image from 'next/image';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from '@/components/ui/sidebar';

export function OrgSwitcher() {
  const { state } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size='lg' className='pointer-events-none'>
          <Image
            src='/assets/logo.png'
            alt='PetraLabs'
            width={630}
            height={155}
            className={
              state === 'collapsed'
                ? 'size-8 shrink-0 rounded-lg object-contain transition-all duration-200 ease-in-out'
                : 'h-[155px] w-auto max-w-full object-contain transition-all duration-200 ease-in-out'
            }
          />
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
