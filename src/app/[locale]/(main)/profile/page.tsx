'use client';

import { useState, useEffect } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';

export default function ProfilePage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const [profileMsg, setProfileMsg] = useState({ text: '', type: '' });
  const [passwordMsg, setPasswordMsg] = useState({ text: '', type: '' });

  const router = useRouter();
  const t = useTranslations('Profile');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/user/profile');
        if (res.ok) {
          const data = await res.json();
          setName(data.name || '');
          setEmail(data.email || '');
        } else {
          setProfileMsg({ text: 'Errore nel caricamento del profilo.', type: 'error' });
        }
      } catch (err) {
        setProfileMsg({ text: 'Errore di rete.', type: 'error' });
      } finally {
        setIsLoadingProfile(false);
      }
    };
    fetchProfile();
  }, []);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileMsg({ text: '', type: '' });

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });
      const data = await res.json();

      if (res.ok) {
        setProfileMsg({ text: t('saving'), type: 'success' });
        router.refresh();
      } else {
        setProfileMsg({ text: data.error || 'Errore', type: 'error' });
      }
    } catch (err) {
      setProfileMsg({ text: 'Errore di connessione', type: 'error' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPassword(true);
    setPasswordMsg({ text: '', type: '' });

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ text: 'Errore password', type: 'error' });
      setIsSavingPassword(false);
      return;
    }

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();

      if (res.ok) {
        setPasswordMsg({ text: t('updating'), type: 'success' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordMsg({ text: data.error || 'Errore', type: 'error' });
      }
    } catch (err) {
      setPasswordMsg({ text: 'Errore di connessione', type: 'error' });
    } finally {
      setIsSavingPassword(false);
    }
  };

  if (isLoadingProfile) {
    return (
      <div className="catalog-container">
        <header className="catalog-header">
          <h1>{t('title')}</h1>
        </header>
        <p>...</p>
      </div>
    );
  }

  return (
    <div className="catalog-container">
      <header className="catalog-header">
        <h1>{t('title')}</h1>
        <p>{t('subtitle')}</p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '600px', margin: '0 auto', padding: '2rem 0' }}>
        
        {/* Profile Section */}
        <section style={{ background: 'var(--card-bg)', padding: '2rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>{t('personalData')}</h2>
          
          <form onSubmit={handleProfileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="name">{t('nameLabel')}</label>
              <input
                id="name"
                type="text"
                className="form-input"
                placeholder={t('namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label" htmlFor="email">{t('emailLabel')}</label>
              <input
                id="email"
                type="email"
                className="form-input"
                placeholder="tu@esempio.it"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {profileMsg.text && (
              <div style={{ color: profileMsg.type === 'error' ? 'var(--danger)' : 'var(--success)', padding: '0.5rem', borderRadius: '0.25rem', background: profileMsg.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)', fontSize: '0.875rem' }}>
                {profileMsg.type === 'error' ? '⚠️ ' : '✅ '}{profileMsg.text}
              </div>
            )}

            <button type="submit" className="submit-btn" disabled={isSavingProfile}>
              {isSavingProfile ? t('saving') : t('saveChanges')}
            </button>
          </form>
        </section>

        {/* Password Section */}
        <section style={{ background: 'var(--card-bg)', padding: '2rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>{t('changePassword')}</h2>
          
          <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="current-password">{t('currentPassword')}</label>
              <input
                id="current-password"
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            
            <div className="form-group">
              <label className="form-label" htmlFor="new-password">{t('newPassword')}</label>
              <input
                id="new-password"
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="confirm-password">{t('confirmPassword')}</label>
              <input
                id="confirm-password"
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            {passwordMsg.text && (
              <div style={{ color: passwordMsg.type === 'error' ? 'var(--danger)' : 'var(--success)', padding: '0.5rem', borderRadius: '0.25rem', background: passwordMsg.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)', fontSize: '0.875rem' }}>
                {passwordMsg.type === 'error' ? '⚠️ ' : '✅ '}{passwordMsg.text}
              </div>
            )}

            <button type="submit" className="submit-btn" disabled={isSavingPassword}>
              {isSavingPassword ? t('updating') : t('updatePassword')}
            </button>
          </form>
        </section>

      </div>
    </div>
  );
}
