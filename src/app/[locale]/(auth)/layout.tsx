import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (session?.user) {
    redirect('/');
  }

  return (
    <>
      <div style={{ position: 'fixed', top: '16px', right: '16px', zIndex: 100 }}>
        <LanguageSwitcher />
      </div>
      {children}
    </>
  );
}
