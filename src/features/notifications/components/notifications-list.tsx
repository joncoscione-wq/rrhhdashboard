'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Icons } from '@/components/icons';
import { NotificationCard } from '@/components/ui/notification-card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getNotificaciones, marcarLeida, marcarTodasLeidas, marcarNoLeidas } from '../api/service';

const accionLabel: Record<string, string> = {
  creacion: 'Creacion',
  modificacion: 'Modificacion',
  eliminacion: 'Eliminacion'
};

export function NotificationsList() {
  const queryClient = useQueryClient();
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notificaciones'],
    queryFn: getNotificaciones
  });

  const unreadCount = notifications.filter((n) => !n.leida).length;

  async function handleMarkAsRead(id: string) {
    await marcarLeida(Number(id));
    queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
  }

  async function handleMarkAllAsRead() {
    await marcarTodasLeidas();
    queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
  }

  async function handleMarkAsUnread(id: string) {
    await marcarNoLeidas([Number(id)]);
    queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
  }

  return (
    <div className='flex flex-col gap-6'>
      {unreadCount > 0 && (
        <div className='flex justify-end'>
          <Button variant='outline' size='sm' onClick={handleMarkAllAsRead}>
            <Icons.checks className='mr-1.5 h-3.5 w-3.5' />
            Marcar todas como leidas
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className='flex items-center justify-center py-20'>
          <Icons.spinner className='text-muted-foreground h-6 w-6 animate-spin' />
        </div>
      ) : notifications.length === 0 ? (
        <div className='flex flex-col items-center justify-center py-20'>
          <Icons.notification className='text-muted-foreground/30 mb-3 h-12 w-12' />
          <p className='text-muted-foreground text-sm'>No hay notificaciones</p>
        </div>
      ) : (
        <ScrollArea className='h-[calc(100vh-14rem)]'>
          <div className='flex flex-col gap-2'>
            {notifications.map((n) => (
              <NotificationCard
                key={n.id}
                id={String(n.id)}
                title={`${accionLabel[n.accion] ?? n.accion} en ${n.entidad}`}
                body={n.descripcion}
                status={n.leida ? 'read' : 'unread'}
                createdAt={n.created_at}
                onMarkAsRead={n.leida ? undefined : handleMarkAsRead}
                actions={
                  n.leida
                    ? [
                        {
                          id: 'mark-unread',
                          label: 'Marcar no leida',
                          type: 'api_call' as const
                        }
                      ]
                    : []
                }
                onAction={(notifId, actionId) => {
                  if (actionId === 'mark-unread') handleMarkAsUnread(notifId);
                }}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
