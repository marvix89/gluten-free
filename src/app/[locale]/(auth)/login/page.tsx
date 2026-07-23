'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const t = useTranslations('Login');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError(t('error'));
    } else {
      router.push('/');
      router.refresh();
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo-icon">🌾</div>
          <span className="auth-logo-text">Gluten Free</span>
        </div>

        <h1 className="auth-title">{t('title')}</h1>
        <p className="auth-subtitle">
          {t('subtitle')}
        </p>

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">
              {t('emailLabel')}
            </label>
            <input
              id="login-email"
              type="email"
              className="form-input"
              placeholder={t('emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label className="form-label" htmlFor="login-password" style={{ margin: 0 }}>
                {t('passwordLabel')}
              </label>
              <Link href="/forgot-password" style={{ fontSize: '0.875rem', color: 'var(--primary)', textDecoration: 'underline' }}>
                {t('forgotPassword')}
              </Link>
            </div>
            <input
              id="login-password"
              type="password"
              className="form-input"
              placeholder={t('passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="auth-error" role="alert">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            id="login-submit"
            className="submit-btn"
            disabled={loading}
          >
            {loading ? t('loading') : t('submit')}
          </button>
        </form>

        <p className="auth-footer-link">
          {t('noAccount')}{' '}
          <Link href="/register">{t('register')}</Link>
        </p>
      </div>
    </div>
  );
}
