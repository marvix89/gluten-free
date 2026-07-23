'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Category } from '@/types';
import { useApp } from '@/context/AppContext';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { optimizeImageForUpload, optimizeImageForAI } from '@/utils/imageOptimizer';

interface AddProductViewProps {
  onClose?: () => void;
  isModal?: boolean;
}

export default function AddProductView({ onClose, isModal = false }: AddProductViewProps = {}) {
  const t = useTranslations('AddProduct');
  const tCat = useTranslations('Categories');
  const { addCustomProduct, categories } = useApp();
  const router = useRouter();

  const displayCategories = categories.length > 0 ? categories : [{ id: 'personalizzato', label: 'Personalizzato', emoji: '⭐' }];

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('personalizzato');

  const [tags, setTags] = useState<string[]>([]);
  const [tagInputValue, setTagInputValue] = useState('');
  const MAX_TAGS = 5;
  const MAX_TAG_LENGTH = 20;

  const handleTagInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.includes(',')) {
      const parts = val.split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.length > 0) {
        setTags((prev) => {
          const updated = [...prev];
          for (const p of parts) {
            const cleaned = p.slice(0, MAX_TAG_LENGTH);
            if (cleaned && !updated.includes(cleaned) && updated.length < MAX_TAGS) {
              updated.push(cleaned);
            }
          }
          return updated;
        });
      }
      setTagInputValue('');
    } else {
      setTagInputValue(val);
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const cleaned = tagInputValue.trim().slice(0, MAX_TAG_LENGTH);
      if (cleaned && !tags.includes(cleaned) && tags.length < MAX_TAGS) {
        setTags([...tags, cleaned]);
        setTagInputValue('');
      }
    } else if (e.key === 'Backspace' && !tagInputValue && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  };

  const handleTagBlur = () => {
    if (!tagInputValue.trim()) return;
    const cleaned = tagInputValue.trim().slice(0, MAX_TAG_LENGTH);
    if (cleaned && !tags.includes(cleaned) && tags.length < MAX_TAGS) {
      setTags((prev) => [...prev, cleaned]);
      setTagInputValue('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };
  const [glutenLevel, setGlutenLevel] = useState<'none' | 'trace' | 'low'>('none');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  const [aiPrefillInfo, setAiPrefillInfo] = useState<string | null>(null);

  const isFormValid = name.trim().length >= 2 && description.trim().length >= 5;

  const getCatName = (id: string, fallback: string) => {
    if (typeof tCat.has === 'function' && tCat.has(id)) {
      return tCat(id);
    }
    return fallback || id;
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setSubmitError('File non valido. Seleziona un\'immagine.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setSubmitError(t('photoSizeError'));
      return;
    }

    setSubmitError('');
    setAiPrefillInfo(null);
    setIsAnalyzingAI(true);

    try {
      // 1. Ottimizzazione generale in WebP e ridimensionamento con Canvas
      const uploadOptimized = await optimizeImageForUpload(file, { maxDim: 500, quality: 0.82 });
      setPhotoUrl(uploadOptimized);

      // 2. Ottimizzazione a 224x224 per inferenza visuale AI
      const aiOptimized = await optimizeImageForAI(file);
      const res = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: aiOptimized }),
      });

      if (res.ok) {
        const aiData = await res.json();
        const tax = aiData?.taxonomy;
        if (tax) {
          if (tax.categoryId && tax.categoryId !== 'personalizzato') {
            setCategory(tax.categoryId);
          }
          if (tax.suggestedTags && tax.suggestedTags.length > 0) {
            setTags((prev) => {
              const cleanedSuggested = tax.suggestedTags.map((t: string) => t.trim().slice(0, MAX_TAG_LENGTH)).filter(Boolean);
              const merged = Array.from(new Set([...prev, ...cleanedSuggested])).slice(0, MAX_TAGS);
              return merged;
            });
          }
          setAiPrefillInfo(`✨ Dati estratti e precompilati dall'AI (${Math.round(tax.confidence * 100)}% accuratezza su "${tax.matchedTag}")`);
        }
      }
    } catch (err) {
      console.error('Errore durante l\'analisi foto / ottimizzazione:', err);
      setSubmitError('Errore durante l\'elaborazione dell\'immagine.');
    } finally {
      setIsAnalyzingAI(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const finalTags = [...tags];
      if (tagInputValue.trim() && finalTags.length < MAX_TAGS) {
        const cleaned = tagInputValue.trim().slice(0, MAX_TAG_LENGTH);
        if (!finalTags.includes(cleaned)) {
          finalTags.push(cleaned);
        }
      }

      const selectedCat = displayCategories.find((c) => c.id === category);
      const productEmoji = selectedCat?.emoji || '⭐';

      await addCustomProduct({
        name: name.trim(),
        description: description.trim(),
        category,
        emoji: productEmoji,
        tags: finalTags,
        isGlutenFree: true,
        glutenLevel,
        enrichment: photoUrl ? {
          imageUrl: photoUrl,
          imageThumbnailUrl: photoUrl,
        } : undefined,
      });

      setIsSuccess(true);
      setTimeout(() => {
        if (onClose) {
          onClose();
        } else {
          router.push('/');
        }
      }, 1500);
    } catch {
      setSubmitError(t('errorDefault'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="add-view">
      <div className="add-hero">
        <h1>{t('heroTitle')}</h1>
        <p>{t('heroDesc')}</p>
      </div>

      {isSuccess ? (
        <div className="empty-state" role="status" aria-live="polite">
          <span className="empty-icon">✅</span>
          <p className="empty-title">{t('successTitle')}</p>
          <p className="empty-desc">{t('successDesc')}</p>
        </div>
      ) : (
        <form
          className="add-form"
          onSubmit={handleSubmit}
          noValidate
          aria-label={t('heroTitle')}
        >
          <div className="form-content-scroll">
            <div className="form-col-left">
              {/* Photo upload */}
              <div className="form-group">
                <label className="form-label">{t('photoLabel')}</label>
                <div className="photo-upload-container">
                  {photoUrl ? (
                    <>
                      <div className="photo-preview-wrap">
                        <img src={photoUrl} alt="Preview" className="photo-preview-img" />
                      </div>
                      <button
                        type="button"
                        className="photo-remove-btn"
                        onClick={() => {
                          setPhotoUrl(null);
                          setAiPrefillInfo(null);
                        }}
                      >
                        {t('photoRemoveBtn')}
                      </button>
                    </>
                  ) : (
                    <label className="photo-upload-btn">
                      {t('photoUploadBtn')}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoChange}
                        style={{ display: 'none' }}
                      />
                    </label>
                  )}
                </div>
                {isAnalyzingAI && (
                  <div style={{
                    marginTop: '0.65rem',
                    padding: '0.65rem 1rem',
                    borderRadius: '0.5rem',
                    background: 'rgba(99, 102, 241, 0.12)',
                    color: '#6366f1',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <span>🤖 Analisi visuale AI in corso e precompilazione campi...</span>
                  </div>
                )}
                {aiPrefillInfo && !isAnalyzingAI && (
                  <div style={{
                    marginTop: '0.65rem',
                    padding: '0.65rem 1rem',
                    borderRadius: '0.5rem',
                    background: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#10b981',
                    fontSize: '0.85rem',
                    fontWeight: 700
                  }}>
                    {aiPrefillInfo}
                  </div>
                )}
              </div>
            </div>

            <div className="form-col-right">
              {/* Name & Category */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="product-name">
                    {t('nameLabel')}
                  </label>
                  <input
                    id="product-name"
                    className="form-input"
                    type="text"
                    placeholder={t('namePlaceholder')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={60}
                    required
                    aria-required="true"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="product-category">
                    {t('categoryLabel')}
                  </label>
                  <select
                    id="product-category"
                    className="form-select"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as Category)}
                  >
                    {displayCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.emoji} {getCatName(c.id, c.label)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div className="form-group">
                <label className="form-label" htmlFor="product-description">
                  {t('descLabel')}
                </label>
                <textarea
                  id="product-description"
                  className="form-textarea"
                  placeholder={t('descPlaceholder')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={200}
                  required
                  aria-required="true"
                />
                <span className="form-hint">{description.length}/200</span>
              </div>

              {/* Tags */}
              <div className="form-group">
                <label className="form-label" htmlFor="product-tags">
                  {t('tagsLabel')}
                </label>
                <div
                  className="tags-input-container"
                  onClick={() => document.getElementById('product-tags')?.focus()}
                >
                  {tags.map((tag) => (
                    <div className="tag-chip" key={tag}>
                      <span>#{tag}</span>
                      <button
                        type="button"
                        className="tag-chip-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTag(tag);
                        }}
                        aria-label={`Rimuovi tag ${tag}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {tags.length < MAX_TAGS && (
                    <input
                      id="product-tags"
                      className="tag-inline-input"
                      type="text"
                      placeholder={tags.length === 0 ? t('tagsPlaceholder') : 'Aggiungi tag...'}
                      value={tagInputValue}
                      onChange={handleTagInputChange}
                      onKeyDown={handleTagKeyDown}
                      onBlur={handleTagBlur}
                      maxLength={MAX_TAG_LENGTH}
                    />
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <span>{t('tagsHint')} (invio o virgola per aggiungere)</span>
                  <span>{tags.length}/{MAX_TAGS} tag</span>
                </div>
              </div>

              {/* Gluten Level */}
              <div className="form-group">
                <label className="form-label" htmlFor="gluten-level">
                  {t('glutenLabel')}
                </label>
                <select
                  id="gluten-level"
                  className="form-select"
                  value={glutenLevel}
                  onChange={(e) =>
                    setGlutenLevel(e.target.value as 'none' | 'trace' | 'low')
                  }
                >
                  <option value="none">{t('glutenNone')}</option>
                  <option value="trace">{t('glutenTrace')}</option>
                  <option value="low">{t('glutenLow')}</option>
                </select>
              </div>
            </div>
          </div>

          {submitError && (
            <div className="auth-error" role="alert">
              ⚠️ {submitError}
            </div>
          )}

          <button
            id="submit-product"
            type="submit"
            className="submit-btn"
            disabled={!isFormValid || isSubmitting}
            aria-disabled={!isFormValid || isSubmitting}
          >
            {isSubmitting ? t('submitting') : t('submit')}
          </button>
        </form>
      )}
    </div>
  );
}
