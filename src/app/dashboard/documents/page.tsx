import PageContainer from '@/components/layout/page-container';
import DocumentosListingPage from '@/features/documents/components/documentos-listing';

export const metadata = {
  title: 'Dashboard: Documentos'
};

export default function DocumentsPage() {
  return (
    <PageContainer
      pageTitle='Documentos'
      pageDescription='Gestión de documentos y archivos de empleados, celulares y notebooks'
    >
      <DocumentosListingPage />
    </PageContainer>
  );
}
