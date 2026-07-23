'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { signOut, useSession } from 'next-auth/react';
import { useApp } from '@/context/AppContext';
import { useState, useRef, useEffect } from 'react';
import AddProductDialog from './AddProductDialog';
import { ENABLE_I18N_BETA } from '@/config/features';

export default function Header() {
  const t = useTranslations('Header');
  const tCat = useTranslations('Catalog');
  const tCatNames = useTranslations('Categories');
  const locale = useLocale();
  const pathname = usePathname();

  const { data: session } = useSession();
  const {
    favoriteProducts,
    isDark,
    toggleTheme,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    categories,
    allProducts,
    totalCount,
  } = useApp();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isCatMenuOpen, setIsCatMenuOpen] = useState(false);
  const catMenuRef = useRef<HTMLDivElement>(null);

  const getCatName = (id: string, fallback: string) => {
    if (typeof tCatNames.has === 'function' && tCatNames.has(id)) {
      return tCatNames(id);
    }
    return fallback || id;
  };

  const activeCatObj = selectedCategory ? categories.find((c) => c.id === selectedCategory) : null;
  const activeCatLabel = activeCatObj ? getCatName(activeCatObj.id, activeCatObj.label) : null;

  const isActive = (path: string) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path);

  const changeLanguage = (newLocale: string) => {
    if (newLocale === 'it') {
      window.location.href = pathname === '/' ? '/' : pathname;
    } else {
      window.location.href = `/${newLocale}${pathname === '/' ? '' : pathname}`;
    }
    setIsDropdownOpen(false);
  };

  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (catMenuRef.current && !catMenuRef.current.contains(event.target as Node)) {
        setIsCatMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);

    const updateHeight = () => {
      if (headerRef.current) {
        document.documentElement.style.setProperty(
          '--header-height',
          `${headerRef.current.offsetHeight}px`
        );
      }
    };
    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    if (headerRef.current) observer.observe(headerRef.current);
    window.addEventListener('resize', updateHeight);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      observer.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  return (
    <header className="header" ref={headerRef}>
      <div className="header-inner">
        <div className="header-logo">
          <div className="header-logo-icon">🌾</div>
          <span className="header-logo-text">Gluten Free</span>
          <span className="header-badge">✓ {t('badge')}</span>
        </div>

        {pathname === '/' && (
          <div className="header-search-container">
            <div className="search-toolbar">
              <div className="search-toolbar-left">
                <span className="search-icon">🔍</span>

                {activeCatObj && (
                  <span className="active-cat-badge">
                    <span>{activeCatObj.emoji}</span>
                    <span>{activeCatLabel}</span>
                    <button
                      type="button"
                      className="active-cat-remove"
                      onClick={() => setSelectedCategory(null)}
                      title="Rimuovi filtro categoria"
                    >
                      ✕
                    </button>
                  </span>
                )}

                <input
                  id="header-search"
                  className="search-input"
                  type="search"
                  placeholder={activeCatObj ? `Cerca tra ${activeCatLabel}...` : tCat('searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label={tCat('searchLabel')}
                />

                {searchQuery && (
                  <button
                    type="button"
                    className="search-clear"
                    onClick={() => setSearchQuery('')}
                    aria-label={tCat('clearSearch')}
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="toolbar-separator" />

              <div className="cat-dropdown-container" ref={catMenuRef}>
                <button
                  type="button"
                  className={`cat-dropdown-btn ${selectedCategory ? 'has-filter' : ''}`}
                  onClick={() => setIsCatMenuOpen(!isCatMenuOpen)}
                  aria-expanded={isCatMenuOpen}
                  title="Filtra per categoria"
                >
                  <span>{activeCatObj ? activeCatObj.emoji : '🏷️'}</span>
                  <span className="dropdown-label-text">
                    {activeCatObj ? activeCatLabel : tCat('filterAll')}
                  </span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>▾</span>
                </button>

                {isCatMenuOpen && (
                  <div className="cat-dropdown-menu" role="menu">
                    <button
                      type="button"
                      className={`cat-dropdown-item ${!selectedCategory ? 'active' : ''}`}
                      onClick={() => { setSelectedCategory(null); setIsCatMenuOpen(false); }}
                    >
                      <span>🌐 {tCat('filterAll')}</span>
                      <span className="cat-dropdown-count">{totalCount || allProducts.length}</span>
                    </button>

                    {categories.filter((c) => Number(c.count) > 0).map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        className={`cat-dropdown-item ${selectedCategory === cat.id ? 'active' : ''}`}
                        onClick={() => { setSelectedCategory(cat.id); setIsCatMenuOpen(false); }}
                      >
                        <span>{cat.emoji} {getCatName(cat.id, cat.label)}</span>
                        <span className="cat-dropdown-count">{cat.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <nav className="top-nav" aria-label="Navigazione principale">
          <Link
            href="/"
            id="nav-catalog"
            className={`nav-btn ${isActive('/') ? 'active' : ''}`}
          >
            <span className="nav-icon">🔍</span>
            <span className="nav-label">{t('catalog')}</span>
          </Link>

          {!session?.user?.isAdmin && (
            <div className="nav-btn-wrap">
              <Link
                href="/favorites"
                id="nav-favorites"
                className={`nav-btn ${isActive('/favorites') ? 'active' : ''}`}
              >
                <span className="nav-icon">❤️</span>
                <span className="nav-label">{t('favorites')}</span>
              </Link>
              {favoriteProducts.length > 0 && (
                <span className="nav-badge">{favoriteProducts.length}</span>
              )}
            </div>
          )}

          <button
            type="button"
            id="nav-add"
            onClick={() => setIsAddDialogOpen(true)}
            className={`nav-btn ${isAddDialogOpen || isActive('/add') ? 'active' : ''}`}
          >
            <span className="nav-icon">➕</span>
            <span className="nav-label">{t('add')}</span>
          </button>

          {/* Top-level language switcher visibile solo in beta i18n */}
          {ENABLE_I18N_BETA && (
            <div className="lang-switcher">
              <button
                className={`lang-btn ${locale === 'it' ? 'active' : ''}`}
                onClick={() => changeLanguage('it')}
                title="Italiano"
              >
                <span className="fi fi-it" />
              </button>
              <button
                className={`lang-btn ${locale === 'en' ? 'active' : ''}`}
                onClick={() => changeLanguage('en')}
                title="English"
              >
                <span className="fi fi-gb" />
              </button>
            </div>
          )}

          {session?.user && (
            <div className="user-menu" ref={dropdownRef}>
              <button
                className="user-avatar"
                title={session.user.email ?? ''}
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                style={{ cursor: 'pointer', border: 'none', padding: 0 }}
              >
                {(session.user.email ?? 'U')[0].toUpperCase()}
              </button>

              {isDropdownOpen && (
                <div className="user-dropdown">
                  <button onClick={() => { toggleTheme(); setIsDropdownOpen(false); }}>
                    <span>{isDark ? '☀️' : '🌙'}</span> {isDark ? t('themeLight') : t('themeDark')}
                  </button>
                  <Link href="/profile" onClick={() => setIsDropdownOpen(false)}>
                    <span>⚙️</span> {t('account')}
                  </Link>
                  {session.user.isAdmin && (
                    <>
                      <div style={{ height: '1px', background: 'var(--border-color)', margin: '0.5rem 0' }} />
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', padding: '0.2rem 0.75rem', fontWeight: 700, letterSpacing: '0.05em' }}>AMMINISTRAZIONE</div>
                      <Link href="/admin?tab=products" onClick={() => setIsDropdownOpen(false)}>
                        <span>📦</span> Catalogo Prodotti
                      </Link>
                      <Link href="/admin?tab=categories" onClick={() => setIsDropdownOpen(false)}>
                        <span>🏷️</span> Gestione Categorie
                      </Link>
                      <div style={{ height: '1px', background: 'var(--border-color)', margin: '0.5rem 0' }} />
                    </>
                  )}

                  {/* Dropdown language selector visibile solo in beta i18n */}
                  {ENABLE_I18N_BETA && (
                    <div className="dropdown-lang-row">
                      <span className="dropdown-lang-label">{t('langLabel')}:</span>
                      <button
                        className={`lang-btn ${locale === 'it' ? 'active' : ''}`}
                        onClick={() => changeLanguage('it')}
                        title="Italiano"
                      >
                        <span className="fi fi-it" />
                      </button>
                      <button
                        className={`lang-btn ${locale === 'en' ? 'active' : ''}`}
                        onClick={() => changeLanguage('en')}
                        title="English"
                      >
                        <span className="fi fi-gb" />
                      </button>
                    </div>
                  )}

                  <button
                    className="logout-item"
                    onClick={() => signOut({ callbackUrl: '/login' })}
                  >
                    <span>👋</span> {t('logout')}
                  </button>
                </div>
              )}
            </div>
          )}
        </nav>
      </div>
      <AddProductDialog isOpen={isAddDialogOpen} onClose={() => setIsAddDialogOpen(false)} />
    </header>
  );
}
