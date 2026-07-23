'use client';

import { useState } from 'react';
import { optimizeImageForUpload, optimizeImageForAI } from '@/utils/imageOptimizer';
import type { MappedTaxonomyResult } from '@/utils/taxonomy';

interface Prediction {
  label: string;
  score: number;
}

export default function ProductUploader() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [taxonomyResult, setTaxonomyResult] = useState<MappedTaxonomyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setError(null);
    setPredictions([]);
    setTaxonomyResult(null);
    setIsLoading(true);

    try {
      // 1. Ottimizza l'immagine per la visualizzazione / upload generale in WebP
      const uploadOptimized = await optimizeImageForUpload(file, { maxDim: 600, quality: 0.85 });
      setPreviewUrl(uploadOptimized);

      // 2. Forza ridimensionamento a 224x224 per l'inferenza MobileNet v2
      const aiOptimized = await optimizeImageForAI(file);

      // 3. Invio all'endpoint /api/classify
      const response = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: aiOptimized }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Errore durante la classificazione visuale.');
      }

      const data = await response.json();
      setPredictions(data.predictions || []);
      setTaxonomyResult(data.taxonomy || null);
    } catch (err) {
      console.error(err);
      setError((err as Error).message || 'Impossibile completare l\'analisi AI.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      background: 'var(--surface)',
      borderRadius: '1rem',
      border: '1px solid var(--border-color)',
      padding: '1.75rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem',
      boxShadow: '0 4px 20px rgba(0,0,0,0.06)'
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '1.8rem' }}>🤖</span>
          <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>
            Classificatore Visuale AI (MobileNet v2)
          </h3>
        </div>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.5 }}>
          Carica l&apos;immagine di un prodotto per testare la classificazione istantanea. L&apos;immagine viene prima compressa e ridimensionata a <strong>224x224 px</strong> sul Canvas client-side per minimizzare il traffico verso la serverless function.
        </p>
      </div>

      {/* Upload Zone */}
      <label style={{
        border: '2px dashed var(--border-color)',
        borderRadius: '0.85rem',
        padding: '2.5rem 1.5rem',
        textAlign: 'center',
        cursor: 'pointer',
        background: 'rgba(99, 102, 241, 0.03)',
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem'
      }}>
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <span style={{ fontSize: '2.5rem' }}>📸</span>
        <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.05rem' }}>
          {selectedFile ? selectedFile.name : 'Seleziona o trascina una foto del prodotto'}
        </span>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Supporta JPG, PNG, WebP (ottimizzazione automatica attiva)
        </span>
      </label>

      {/* Loading indicator */}
      {isLoading && (
        <div style={{
          padding: '1.5rem',
          borderRadius: '0.75rem',
          background: 'rgba(99, 102, 241, 0.1)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div className="spinner" style={{
            width: '24px',
            height: '24px',
            border: '3px solid rgba(99, 102, 241, 0.3)',
            borderTopColor: '#6366f1',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <div>
            <div style={{ fontWeight: 700, color: '#6366f1' }}>Analisi AI MobileNet in corso...</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Elaborazione del tensore 224x224 sul server Vercel (la prima volta potrebbe richiedere qualche secondo per caricare i 14MB).
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div style={{
          padding: '1rem',
          borderRadius: '0.75rem',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#ef4444',
          fontWeight: 600
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Results grid */}
      {previewUrl && !isLoading && predictions.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginTop: '0.5rem' }}>
          {/* Preview Image Card */}
          <div style={{
            background: 'var(--background)',
            borderRadius: '0.85rem',
            padding: '1rem',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem'
          }}>
            <img
              src={previewUrl}
              alt="Anteprima ottimizzata"
              style={{
                maxWidth: '100%',
                maxHeight: '240px',
                objectFit: 'contain',
                borderRadius: '0.5rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
            />
            {taxonomyResult && (
              <div style={{
                width: '100%',
                padding: '0.85rem',
                borderRadius: '0.65rem',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 800, textTransform: 'uppercase' }}>
                  Categoria Mappata per DB
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                  {taxonomyResult.emoji} {taxonomyResult.categoryLabel}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  ID: <code>{taxonomyResult.categoryId}</code> • Affidabilità: {Math.round(taxonomyResult.confidence * 100)}%
                </div>
              </div>
            )}
          </div>

          {/* Predictions breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              🎯 Tag Rilevati da MobileNet v2
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {predictions.map((pred, i) => {
                const percent = Math.round(pred.score * 100);
                return (
                  <div key={i} style={{
                    background: 'var(--background)',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.65rem',
                    border: '1px solid var(--border-color)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                        {pred.label}
                      </span>
                      <span style={{ fontWeight: 800, fontSize: '0.9rem', color: percent > 50 ? '#10b981' : '#6366f1' }}>
                        {percent}%
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div style={{
                      width: '100%',
                      height: '8px',
                      background: 'var(--border-color)',
                      borderRadius: '4px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${percent}%`,
                        height: '100%',
                        background: percent > 50
                          ? 'linear-gradient(90deg, #10b981, #059669)'
                          : 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                        transition: 'width 0.4s ease'
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
            {taxonomyResult && taxonomyResult.suggestedTags.length > 0 && (
              <div style={{ marginTop: '0.5rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                  💡 Tag Consigliati per il Prodotto:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {taxonomyResult.suggestedTags.map((tag, idx) => (
                    <span key={idx} style={{
                      background: 'rgba(99, 102, 241, 0.12)',
                      color: '#6366f1',
                      padding: '0.25rem 0.65rem',
                      borderRadius: '999px',
                      fontSize: '0.8rem',
                      fontWeight: 700
                    }}>
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
