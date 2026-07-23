'use client';

import { useState } from 'react';
import type { Product } from '@/types';
import { useApp } from '@/context/AppContext';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import ProductDialog from './ProductDialog';
import CategoryIcon from './CategoryIcon';

interface ProductCardProps {
  product: Product;
  isShowDeleteButton?: boolean;
}

export default function ProductCard({
  product,
  isShowDeleteButton = false,
}: ProductCardProps) {
  const t = useTranslations('ProductCard');
  const { data: session } = useSession();
  const isAdmin = !!session?.user?.isAdmin;
  const { toggleFavorite, isFavorite, removeCustomProduct } = useApp();
  const isFav = isFavorite(product.id);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(product.id);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(t('removeConfirm', { name: product.name }))) {
      removeCustomProduct(product.id);
    }
  };

  // imageUrl è già un URL proxy /api/images/{id} — sempre valido se definito
  const validImgUrl = product.enrichment?.imageUrl || null;
  const hasImage = !!validImgUrl;

  return (
    <article
      className="product-card"
      id={`product-${product.id}`}
      onClick={() => setIsDialogOpen(true)}
      style={{ cursor: 'pointer' }}
    >
      {/* Pannello sinistro: immagine a tutta altezza o icona categoria */}
      <div className="product-card-media">
        {hasImage && !imgError ? (
          <>
            {/* Skeleton shimmer visibile finché l'immagine non è pronta */}
            {!imgLoaded && <div className="product-img-skeleton" aria-hidden="true" />}
            <Image
              src={validImgUrl!}
              alt={product.name}
              fill
              sizes="120px"
              className={`product-thumb${imgLoaded ? ' is-loaded' : ''}`}
              onLoad={() => setImgLoaded(true)}
              onError={() => { setImgError(true); setImgLoaded(true); }}
              loading="lazy"
            />
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', position: 'relative' }}>
            <CategoryIcon
              category={product.category}
              size={30}
              className="product-cat-icon"
            />
          </div>
        )}
      </div>

      {/* Contenuto destro */}
      <div className="product-card-content">
        <div className="product-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <h3 className="product-name" title={product.name} style={{ margin: 0 }}>{product.name}</h3>
          </div>
          {product.enrichment?.brand && (
            <p className="product-brand" title={product.enrichment.brand}>{product.enrichment.brand}</p>
          )}
        </div>

        {/* Azioni */}
        <div className="product-card-actions">
          {isShowDeleteButton && product.isCustom && (
            <button
              className="icon-btn delete-btn"
              onClick={handleDeleteClick}
              title={t('removeProduct')}
              aria-label={`${t('removeProduct')}: ${product.name}`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" stroke="currentColor" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" />
                <path d="M10 11v6M14 11v6" stroke="currentColor" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" />
              </svg>
            </button>
          )}
          {!isAdmin && (
            <button
              id={`fav-btn-${product.id}`}
              className={`icon-btn fav-btn ${isFav ? 'is-active' : ''}`}
              onClick={handleFavoriteClick}
              title={isFav ? t('removeFavorite') : t('addFavorite')}
              aria-label={
                isFav
                  ? `${t('removeFavorite')}: ${product.name}`
                  : `${t('addFavorite')}: ${product.name}`
              }
              aria-pressed={isFav}
            >
              {isFav ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z" stroke="currentColor" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {isDialogOpen && (
        <ProductDialog product={product} onClose={() => setIsDialogOpen(false)} />
      )}
    </article>
  );
}
