import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppProvider } from '@/context/AppContext';
import Header from '@/components/Header';

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <AppProvider>
      <div className="app">
        <Header />
        <main className="main-content" id="main-content">
          {children}
        </main>
      </div>
    </AppProvider>
  );
}
