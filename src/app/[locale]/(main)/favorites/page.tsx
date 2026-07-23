import FavoritesView from '@/components/FavoritesView';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Meta' });
  return { title: t('favorites') };
}

export default function FavoritesPage() {
  return <FavoritesView />;
}
