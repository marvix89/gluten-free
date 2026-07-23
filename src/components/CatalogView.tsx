'use client';

import { useApp } from '@/context/AppContext';
import ProductCard from './ProductCard';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';

export default function CatalogView() {
  const t = useTranslations('Catalog');
  const tCat = useTranslations('Categories');
  const {
    products,
    allProducts,
    categories,
    selectedCategory,
    isLoading,
    error,
    setSearchQuery,
    setSelectedCategory,
    page,
    pageSize,
    totalCount,
    setPage,
  } = useApp();

  const gridRef = useRef<HTMLDivElement>(null);


  // Loading iniziale: nessun prodotto ancora caricato
  if (isLoading && allProducts.length === 0) {
    return (
      <div className="loading-state">
        <div className="loading-spinner" />
        <p>{t('loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state" role="alert">
        <span className="empty-icon">⚠️</span>
        <p className="empty-title">{t('errorTitle')}</p>
        <p className="empty-desc">{error}</p>
        <button className="empty-cta" onClick={() => window.location.reload()}>
          {t('retry')}
        </button>
      </div>
    );
  }

  const getCatName = (id: string, fallback: string) => {
    if (typeof tCat.has === 'function' && tCat.has(id)) {
      return tCat(id);
    }
    return fallback || id;
  };

  const activeCatObj = selectedCategory ? categories.find(c => c.id === selectedCategory) : null;
  const activeCatLabel = activeCatObj ? getCatName(activeCatObj.id, activeCatObj.label) : null;

  const totalPages = Math.ceil(totalCount / pageSize);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const renderPaginationControls = (position: 'top' | 'bottom') => {
    if (totalPages <= 1) return null;

    return (
      <nav
        className={`catalog-pagination ${position}`}
        aria-label={`Paginazione ${position === 'top' ? 'superiore' : 'inferiore'}`}
      >
        <button
          type="button"
          onClick={() => handlePageChange(Math.max(1, page - 1))}
          disabled={page === 1 || isLoading}
          className="pagination-btn"
          aria-label="Pagina precedente"
        >
          <span>&larr;</span>
          <span>Prec.</span>
        </button>

        <div className="pagination-badge" aria-current="page">
          <span>Pagina</span>
          <strong>{page}</strong>
          <span>di</span>
          <strong>{totalPages}</strong>
        </div>

        <button
          type="button"
          onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages || isLoading}
          className="pagination-btn"
          aria-label="Pagina successiva"
        >
          <span>Succ.</span>
          <span>&rarr;</span>
        </button>
      </nav>
    );
  };

  return (
    <div>
      {/* Results header */}
      <div className="section-header">
        <div className="section-header-title">
          <h1 className="section-title">
            {selectedCategory && activeCatLabel ? activeCatLabel : t('title')}
          </h1>
          <span className="section-count">
            {products.length} / {totalCount || allProducts.length} {t('title')}
          </span>
        </div>
        {products.length > 0 && renderPaginationControls('top')}
      </div>

      {/* Grid — ref per lo scroll selettivo */}
      <div ref={gridRef} className={`catalog-grid-wrapper${isLoading ? ' is-loading' : ''}`}>
        {products.length > 0 ? (
          <>
            {/* Overlay di caricamento paginazione */}
            {isLoading && (
              <div className="grid-loading-overlay" aria-hidden="true">
                <div className="loading-spinner small" />
              </div>
            )}

            <div className="products-grid" role="list" aria-label={t('title')}>
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>

            {renderPaginationControls('bottom')}
          </>
        ) : !isLoading ? (
          <div className="empty-state" role="status">
            <span className="empty-icon">🔎</span>
            <p className="empty-title">{t('noResultsTitle')}</p>
            <p className="empty-desc">{t('noResultsDesc')}</p>
            <button
              className="empty-cta"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory(null);
              }}
            >
              {t('resetFilters')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
