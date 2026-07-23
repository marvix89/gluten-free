import type { Metadata } from 'next';
import { SessionProvider } from 'next-auth/react';
import '../globals.css';
import 'flag-icons/css/flag-icons.min.css';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Meta' });
  return {
    title: t('site'),
    description: t('description'),
    icons: {
      icon: '/favicon.svg',
      shortcut: '/favicon.svg',
      apple: '/favicon.svg',
    },
  };
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  
  // Ensure that the incoming `locale` is valid
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  // Providing all messages to the client
  // side is the easiest way to get started
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <SessionProvider>
            {children}
            <footer className="global-footer">
              <div className="footer-links">
                <a href="/privacy">Privacy Policy</a>
                <a href="/cookie">Cookie Policy</a>
                <a href="/terms">Termini e Condizioni</a>
              </div>
              <div className="footer-attribution">
                Dati e immagini dei prodotti:{' '}
                <a
                  href="https://it.openfoodfacts.org"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Food Facts
                </a>{' '}
                – licenza{' '}
                <a
                  href="https://opendatacommons.org/licenses/odbl/1-0/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ODbL
                </a>
                {' '}·{' '}
                <a
                  href="https://creativecommons.org/licenses/by-sa/3.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  CC BY-SA
                </a>
              </div>
              <div className="footer-copyright">
                &copy; {new Date().getFullYear()} Gluten Free. Tutti i diritti riservati.
              </div>
            </footer>
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
