'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { ENABLE_I18N_BETA } from '@/config/features';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations('Header');

  if (!ENABLE_I18N_BETA) {
    return null;
  }

  const changeLanguage = (newLocale: string) => {
    if (newLocale === 'it') {
      window.location.href = pathname === '/' ? '/' : pathname;
    } else {
      window.location.href = `/${newLocale}${pathname === '/' ? '' : pathname}`;
    }
  };

  return (
    <div className="lang-switcher" aria-label={t('langLabel')}>
      <button
        className={`lang-btn ${locale === 'it' ? 'active' : ''}`}
        onClick={() => changeLanguage('it')}
        title="Italiano"
        aria-pressed={locale === 'it'}
      >
        <span className="fi fi-it" />
      </button>
      <button
        className={`lang-btn ${locale === 'en' ? 'active' : ''}`}
        onClick={() => changeLanguage('en')}
        title="English"
        aria-pressed={locale === 'en'}
      >
        <span className="fi fi-gb" />
      </button>
    </div>
  );
}
