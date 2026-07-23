import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AdminDashboardClient from './AdminDashboardClient';

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user?.isAdmin) {
    redirect('/');
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1rem' }}>
      <h1>Gestione Catalogo Prodotti</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
        Cerca prodotti su Open Food Facts, verifica i conflitti e importali nel database locale.
      </p>
      
      <AdminDashboardClient />
    </div>
  );
}
