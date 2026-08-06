import PageContainer from '@/components/layout/page-container';
import { PayrollPage } from '@/features/payroll/components/payroll-page';
import { sectionHelp } from '@/config/section-help';

export const metadata = { title: 'Dashboard: Sueldos' };

export default function PayrollPageRoute() {
  return (
    <PageContainer
      pageTitle='Sueldos'
      pageDescription='Histórico de sueldos mensuales por empleado'
      infoContent={sectionHelp.payroll}
    >
      <PayrollPage />
    </PageContainer>
  );
}
