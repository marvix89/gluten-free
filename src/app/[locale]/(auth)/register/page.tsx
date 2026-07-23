'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';

export default function RegisterPage() {
  const t = useTranslations('Register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError(t('errorPasswordMismatch'));
      return;
    }
    if (password.length < 8) {
      setError(t('errorPasswordLength'));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? t('errorNetwork'));
        setLoading(false);
        return;
      }

      await signIn('credentials', { email, password, redirect: false });
      router.push('/');
      router.refresh();
    } catch {
      setError(t('errorNetwork'));
      setLoading(false);
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
        <p className="auth-subtitle">{t('subtitle')}</p>

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="reg-name">
              {t('nameLabel')}
            </label>
            <input
              id="reg-name"
              type="text"
              className="form-input"
              placeholder={t('namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-email">
              {t('emailLabel')}
            </label>
            <input
              id="reg-email"
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
            <label className="form-label" htmlFor="reg-password">
              {t('passwordLabel')}
            </label>
            <input
              id="reg-password"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-confirm">
              {t('confirmLabel')}
            </label>
            <input
              id="reg-confirm"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="auth-error" role="alert">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            id="register-submit"
            className="submit-btn"
            disabled={loading}
          >
            {loading ? t('loading') : t('submit')}
          </button>
        </form>

        <p className="auth-footer-link">
          {t('hasAccount')} <Link href="/login">{t('login')}</Link>
        </p>
      </div>
    </div>
  );
}
