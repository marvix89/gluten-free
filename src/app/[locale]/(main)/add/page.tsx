import AddProductView from '@/components/AddProductView';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Meta' });
  return { title: t('add') };
}

export default function AddPage() {
  return <AddProductView />;
}
