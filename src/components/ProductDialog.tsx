'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Product } from '@/types';
import { useApp } from '@/context/AppContext';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { getValidImageUrl } from '@/lib/image-utils';

interface ProductDialogProps {
  product: Product;
  onClose: () => void;
}

export default function ProductDialog({ product, onClose }: ProductDialogProps) {
  const [mounted, setMounted] = useState(false);
  const t = useTranslations('ProductDialog');
  const tCard = useTranslations('ProductCard');
  const tCat = useTranslations('Categories');
  const { categories } = useApp();

  const categoryInfo = categories.find((c) => c.id === product.category) || { color: product.categoryColor || '#6366f1', label: product.categoryLabel || product.category };
  const enrichment = product.enrichment;
  const { data: session } = useSession();
  const isAdmin = !!session?.user?.isAdmin;

  useEffect(() => {
    setMounted(true);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const glutenLabel = () => {
    switch (product.glutenLevel) {
      case 'trace': return tCard('glutenTrace');
      case 'low': return tCard('glutenLow');
      default: return tCard('glutenNone');
    }
  };

  const formatAllergen = (alg: string) => {
    const clean = alg.replace(/^[a-z]{2}:/, '').toLowerCase();
    const map: Record<string, string> = {
      milk: 'Latte',
      lait: 'Latte',
      latte: 'Latte',
      gluten: 'Glutine',
      soybeans: 'Soia',
      soy: 'Soia',
      soja: 'Soia',
      soia: 'Soia',
      eggs: 'Uova',
      egg: 'Uova',
      oeufs: 'Uova',
      uova: 'Uova',
      nuts: 'Frutta a guscio',
      'tree nuts': 'Frutta a guscio',
      hazelnuts: 'Nocciole',
      almonds: 'Mandorle',
      walnuts: 'Noci',
      peanuts: 'Arachidi',
      cacahuetes: 'Arachidi',
      arachidi: 'Arachidi',
      mustard: 'Senape',
      moutarde: 'Senape',
      senape: 'Senape',
      'sesame seeds': 'Semi di sesamo',
      sesame: 'Sesamo',
      celery: 'Sedano',
      fish: 'Pesce',
      crustaceans: 'Crostacei',
      molluscs: 'Molluschi',
      sulphites: 'Solfiti',
      'sulphur dioxide and sulphites': 'Solfiti',
      solfiti: 'Solfiti',
      lupin: 'Lupini',
    };
    if (map[clean]) return map[clean];
    return clean.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const largeImg = getValidImageUrl(enrichment?.imageUrl);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div className="product-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="product-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="product-modal-close" onClick={onClose} aria-label={t('close')}>
          ✕
        </button>

        <div className="product-modal-header" style={{ borderBottomColor: categoryInfo ? categoryInfo.color : undefined }}>
          <div
            className="product-modal-emoji"
            style={{
              background: categoryInfo ? `${categoryInfo.color}22` : undefined,
            }}
          >
            {product.emoji}
          </div>
          <div className="product-modal-title-wrap">
            <span className="product-modal-category">
              {categoryInfo ? (typeof tCat.has === 'function' && tCat.has(product.category) ? tCat(product.category as any) : categoryInfo.label) : product.category}
            </span>
            <h2 id="modal-title" className="product-modal-name">{product.name}</h2>
            {enrichment?.brand && (
              <p className="product-modal-brand">
                {enrichment.brand} {enrichment.quantity && `· ${enrichment.quantity}`}
              </p>
            )}
          </div>
        </div>

        <div className="product-modal-body">
          {/* Badges row */}
          <div className="product-modal-badges">
            <span className={`gluten-badge ${product.glutenLevel ?? 'none'}`}>
              {glutenLabel()}
            </span>
            {enrichment?.nutriScore && (
              <span className={`nutriscore-badge score-${enrichment.nutriScore}`}>
                Nutri-Score {enrichment.nutriScore.toUpperCase()}
              </span>
            )}
            {enrichment?.ecoScore && (
              <span className={`ecoscore-badge score-${enrichment.ecoScore}`}>
                Eco-Score {enrichment.ecoScore.toUpperCase()}
              </span>
            )}
            {enrichment?.novaGroup && (
              <span className="nova-badge">
                NOVA {enrichment.novaGroup}
              </span>
            )}
          </div>

          <div className="product-modal-grid">
            {largeImg ? (
              <div className="product-modal-img-wrap">
                <Image
                  src={largeImg}
                  alt={product.name}
                  width={240}
                  height={240}
                  className="product-modal-img"
                  unoptimized
                />
              </div>
            ) : isAdmin ? (
              <div className="product-modal-img-wrap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', border: '2px dashed #f87171', borderRadius: '1rem', padding: '1rem', textAlign: 'center', color: '#991b1b' }}>
                <span style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</span>
                <strong style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>Immagine Assente</strong>
                <span style={{ fontSize: '0.75rem', color: '#b91c1c' }}>Popolabile tramite importazione o sincronizzazione nel pannello admin.</span>
              </div>
            ) : null}

            <div className="product-modal-details">
              <div className="detail-section">
                <h4>{t('description')}</h4>
                <p className="detail-desc">{product.description}</p>
              </div>

              {enrichment?.ingredientsText && (
                <div className="detail-section">
                  <h4>{t('ingredients')}</h4>
                  <p className="detail-text">{enrichment.ingredientsText}</p>
                </div>
              )}

              {enrichment?.allergens && enrichment.allergens.length > 0 && (
                <div className="detail-section">
                  <h4>{t('allergens')}</h4>
                  <div className="modal-tags">
                    {enrichment.allergens.map((alg) => (
                      <span key={alg} className="modal-tag allergen-tag">{formatAllergen(alg)}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {enrichment?.nutriments && (
            <div className="nutrition-section">
              <h4>{t('nutrition')}</h4>
              <div className="nutrition-table">
                {enrichment.nutriments.kcal100g !== undefined && (
                  <div className="nutrition-row">
                    <span>{t('kcal')}</span>
                    <strong>{Math.round(enrichment.nutriments.kcal100g)} kcal</strong>
                  </div>
                )}
                {enrichment.nutriments.proteins100g !== undefined && (
                  <div className="nutrition-row">
                    <span>{t('proteins')}</span>
                    <strong>{Number(enrichment.nutriments.proteins100g).toFixed(1)} g</strong>
                  </div>
                )}
                {enrichment.nutriments.fat100g !== undefined && (
                  <div className="nutrition-row">
                    <span>{t('fat')}</span>
                    <strong>{Number(enrichment.nutriments.fat100g).toFixed(1)} g</strong>
                  </div>
                )}
                {enrichment.nutriments.carbs100g !== undefined && (
                  <div className="nutrition-row">
                    <span>{t('carbs')}</span>
                    <strong>{Number(enrichment.nutriments.carbs100g).toFixed(1)} g</strong>
                  </div>
                )}
                {enrichment.nutriments.sugars100g !== undefined && (
                  <div className="nutrition-row sub-row">
                    <span>{t('sugars')}</span>
                    <strong>{Number(enrichment.nutriments.sugars100g).toFixed(1)} g</strong>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
