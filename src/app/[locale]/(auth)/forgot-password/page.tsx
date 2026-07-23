'use client';

import { useState } from 'react';
import { Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';

export default function ForgotPasswordPage() {
  const t = useTranslations('ForgotPassword');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setMessage(t('successMessage'));
        setEmail('');
      } else {
        const data = await res.json();
        setError(data.error || t('errorNetwork'));
      }
    } catch {
      setError(t('errorNetwork'));
    } finally {
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
            <label className="form-label" htmlFor="forgot-email">
              {t('emailLabel')}
            </label>
            <input
              id="forgot-email"
              type="email"
              className="form-input"
              placeholder={t('emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          {error && (
            <div className="auth-error" role="alert">
              ⚠️ {error}
            </div>
          )}

          {message && (
            <div style={{ color: 'var(--success)', padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(34, 197, 94, 0.1)', fontSize: '0.875rem', marginBottom: '1rem', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
              ✅ {message}
            </div>
          )}

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? t('loading') : t('submit')}
          </button>
        </form>

        <p className="auth-footer-link">
          <Link href="/login">{t('backToLogin')}</Link>
        </p>
      </div>
    </div>
  );
}
