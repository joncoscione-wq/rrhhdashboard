import PageContainer from '@/components/layout/page-container';
import LegajoListingPage from '@/features/legajo/components/legajo-listing';
import { NuevoLegajoButton } from '@/features/legajo/components/nuevo-legajo-button';
import { searchParamsCache } from '@/lib/searchparams';
import { sectionHelp } from '@/config/section-help';
import type { SearchParams } from 'nuqs/server';

export const metadata = { title: 'Dashboard: Legajo' };

type PageProps = { searchParams: Promise<SearchParams> };

export default async function Page(props: PageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);

  return (
    <PageContainer
      pageTitle='Legajo'
      pageDescription='Ficha completa de todos los empleados'
      infoContent={sectionHelp.legajo}
      pageHeaderAction={<NuevoLegajoButton />}
    >
      <LegajoListingPage />
    </PageContainer>
  );
}
