import PageContainer from '@/components/layout/page-container';
import { NotificationsList } from '@/features/notifications/components/notifications-list';

export const metadata = { title: 'Dashboard: Notificaciones' };

export default function Page() {
  return (
    <PageContainer
      pageTitle='Notificaciones'
      pageDescription='Historial de cambios y actualizaciones del sistema'
    >
      <NotificationsList />
    </PageContainer>
  );
}
