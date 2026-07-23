'use client';

import { useState, useEffect, useRef } from 'react';
import type { Product } from '@/types';

type SyncState = {
  query: string;
  currentPage: number;
  totalPages: number;
  totalProducts: number;
} | null;

type ImageSyncState = {
  currentPage: number;
  totalPages: number;
  totalPending: number;
  succeeded: number;
  failed: number;
} | null;

type CategoryItem = {
  id: string;
  label: string;
  emoji: string;
  color: string;
  count: number;
};

export default function AdminDashboardClient() {
  const [activeTab, setActiveTab] = useState<'products' | 'images' | 'categories'>('products');
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Product[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  // Product sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>(null);
  const isSyncingRef = useRef(false);

  // Image sync state
  const [isImageSyncing, setIsImageSyncing] = useState(false);
  const [imageSyncState, setImageSyncState] = useState<ImageSyncState>(null);
  const [imageSyncStats, setImageSyncStats] = useState<{ total_public: number; with_image: number; pending_image: number } | null>(null);
  const [imageChunkSize, setImageChunkSize] = useState(10);
  const isImageSyncingRef = useRef(false);

  // Categories state
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [isLoadingCats, setIsLoadingCats] = useState(false);
  const [isRecategorizing, setIsRecategorizing] = useState(false);
  const [editingCat, setEditingCat] = useState<CategoryItem | null>(null);
  const [catLabel, setCatLabel] = useState('');
  const [catEmoji, setCatEmoji] = useState('🏷️');
  const [catColor, setCatColor] = useState('#6366f1');
  const [isCreatingCat, setIsCreatingCat] = useState(false);
  const [selectedCategoryView, setSelectedCategoryView] = useState<CategoryItem | null>(null);
  const [catProducts, setCatProducts] = useState<any[]>([]);
  const [isLoadingCatProducts, setIsLoadingCatProducts] = useState(false);
  const [classifyingProductId, setClassifyingProductId] = useState<string | null>(null);
  const [singleAiResultModal, setSingleAiResultModal] = useState<any | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'categories') setActiveTab('categories');
      else if (tab === 'images') setActiveTab('images');
      else setActiveTab('products');
    }
  }, []);

  const fetchLocalProducts = async (targetPage: number, targetPageSize: number) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/products?page=${targetPage}&limit=${targetPageSize}`);
      if (!res.ok) throw new Error('Errore durante il caricamento dei prodotti locali');
      const data = await res.json();
      setResults(data.products || []);
      setTotalCount(data.count || 0);
      setPage(targetPage);
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCategories = async () => {
    setIsLoadingCats(true);
    try {
      const res = await fetch('/api/admin/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingCats(false);
    }
  };

  const fetchImageSyncStats = async () => {
    try {
      const res = await fetch('/api/admin/sync-images');
      if (res.ok) {
        const data = await res.json();
        setImageSyncStats(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchLocalProducts(1, pageSize);
    const saved = localStorage.getItem('gluten_free_sync_state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.currentPage < parsed.totalPages) {
          setSyncState(parsed);
          setQuery(parsed.query);
        } else {
          localStorage.removeItem('gluten_free_sync_state');
        }
      } catch (e) {
        localStorage.removeItem('gluten_free_sync_state');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize]);

  useEffect(() => {
    if (activeTab === 'categories') fetchCategories();
    if (activeTab === 'images') {
      fetchImageSyncStats();
    }
  }, [activeTab]);

  // ─── Product import ────────────────────────────────────────────────

  const updateSyncState = (newState: SyncState) => {
    setSyncState(newState);
    if (newState) {
      localStorage.setItem('gluten_free_sync_state', JSON.stringify(newState));
    } else {
      localStorage.removeItem('gluten_free_sync_state');
    }
  };

  const startOrResumeSync = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSyncing(true);
    isSyncingRef.current = true;
    updateSyncState(null);

    // Su Vercel ogni invocazione serverless ha un IP diverso → loop lato client.
    // In locale il server ha sempre lo stesso IP → bulk-import SSE con delay.
    const isVercel = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

    if (isVercel) {
      // ── MODALITÀ VERCEL: loop client-side, ogni pagina = IP diverso ──────────
      setMessage({ type: 'info', text: '🚀 Import avviato (modalità Vercel — IP multipli)...' });
      let currentPage = 1;
      let totalPages = 0; // verrà impostato dalla prima risposta
      let totalImported = 0;
      const PAGE_SIZE = 100;
      // Delay più breve su Vercel perché ogni call arriva da IP diverso
      const VERCEL_DELAY_MS = 1500;

      try {
        while (isSyncingRef.current && (currentPage === 1 || currentPage <= totalPages)) {
          let pageData: any = null;
          let attempts = 0;
          while (!pageData && attempts < 5 && isSyncingRef.current) {
            attempts++;
            try {
              const res = await fetch('/api/admin/auto-import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ q: query, page: currentPage, limit: PAGE_SIZE }),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              pageData = await res.json();
            } catch (err: any) {
              if (!isSyncingRef.current) break;
              const wait = attempts * 3000;
              setMessage({ type: 'error', text: `Pagina ${currentPage}, tentativo ${attempts}/5: ${err.message}. Riprovo tra ${wait / 1000}s...` });
              await new Promise(r => setTimeout(r, wait));
            }
          }
          if (!pageData || !isSyncingRef.current) break;

          // Imposta totalPages dalla prima risposta reale
          if (currentPage === 1) {
            totalPages = pageData.pageCount || 1;
            setMessage({ type: 'info', text: `📊 Trovati ${pageData.totalCount} prodotti — ${totalPages} pagine da importare` });
          }
          totalImported += pageData.count || 0;
          updateSyncState({ query, currentPage, totalPages, totalProducts: totalImported });
          if (currentPage % 5 === 0) fetchLocalProducts(1, pageSize);

          setMessage({ type: 'info', text: `📦 Pagina ${currentPage}/${totalPages} — ${totalImported} prodotti importati` });

          if (currentPage >= totalPages) {
            setMessage({ type: 'success', text: `✅ Import completato! ${totalImported} prodotti in ${totalPages} pagine.` });
            updateSyncState(null);
            fetchLocalProducts(1, pageSize);
            break;
          }
          currentPage++;
          if (isSyncingRef.current) await new Promise(r => setTimeout(r, VERCEL_DELAY_MS));
        }
      } catch (err: any) {
        setMessage({ type: 'error', text: `Errore critico: ${err?.message}` });
      }

    } else {
      // ── MODALITÀ LOCALE: bulk-import SSE con delay anti-rate-limit ───────────
      setMessage({ type: 'info', text: '⏳ Import locale avviato — delay automatici anti-blocco tra le pagine...' });

      try {
        const res = await fetch('/api/admin/bulk-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: query, pageSize: 100 }),
        });

        if (!res.ok || !res.body) throw new Error(`Errore avvio import: ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (isSyncingRef.current) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            const eventLine = part.match(/^event: (\S+)/);
            const dataLine = part.match(/^data: (.+)$/m);
            if (!eventLine || !dataLine) continue;

            const eventType = eventLine[1];
            let data: any = {};
            try { data = JSON.parse(dataLine[1]); } catch { continue; }

            if (eventType === 'progress') {
              if (data.type === 'page_done') {
                updateSyncState({ query, currentPage: data.page, totalPages: data.totalPages, totalProducts: data.totalImported });
                if (data.page % 5 === 0) fetchLocalProducts(1, pageSize);
              }
              setMessage({ type: 'info', text: data.message || '' });
            } else if (eventType === 'done') {
              setMessage({ type: 'success', text: `✅ ${data.message}` });
              updateSyncState(null);
              fetchLocalProducts(1, pageSize);
            } else if (eventType === 'error') {
              setMessage({ type: 'error', text: `❌ ${data.message}` });
            }
          }
        }
      } catch (err: any) {
        setMessage({ type: 'error', text: `Errore critico: ${err?.message}` });
      }
    }

    setIsSyncing(false);
    isSyncingRef.current = false;
  };


  const stopSync = () => {
    isSyncingRef.current = false;
    setIsSyncing(false);
    setMessage({ type: 'info', text: 'Importazione messa in pausa.' });
  };

  const clearSync = () => {
    updateSyncState(null);
    setQuery('');
  };

  // ─── Image sync ────────────────────────────────────────────────────

  const startImageSync = async () => {
    if (isImageSyncingRef.current) return;
    setIsImageSyncing(true);
    isImageSyncingRef.current = true;
    setMessage({ type: 'info', text: `▶ Avvio sincronizzazione automatica a chunk da ${imageChunkSize}...` });

    let batchCount = 0;
    let totalSucceeded = imageSyncState?.succeeded ?? 0;
    let totalFailed = imageSyncState?.failed ?? 0;
    let currentPending = imageSyncStats?.pending_image ?? 999;

    try {
      while (isImageSyncingRef.current && currentPending > 0) {
        batchCount++;
        setMessage({
          type: 'info',
          text: `⏳ Elaborazione chunk #${batchCount} (${imageChunkSize} immagini in corso)... Restano da sincronizzare: ${currentPending}.`,
        });

        try {
          const res = await fetch('/api/admin/sync-images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page: 1, pageSize: imageChunkSize }),
          });
          if (!res.ok) throw new Error(`Errore server (${res.status})`);
          const data = await res.json();

          if (data.stats) {
            setImageSyncStats(data.stats);
            currentPending = data.stats.pending_image ?? 0;
          } else {
            currentPending = data.totalPending ?? 0;
          }

          totalSucceeded += data.succeeded || 0;
          totalFailed += data.failed || 0;

          setImageSyncState({
            currentPage: batchCount,
            totalPages: batchCount,
            totalPending: currentPending,
            succeeded: totalSucceeded,
            failed: totalFailed,
          });

          if (currentPending === 0 || data.processed === 0) {
            setMessage({
              type: 'success',
              text: `🎉 Sincronizzazione completata con successo! ✅ ${totalSucceeded} immagini caricate su Cloudinary, ${totalFailed} non disponibili/in coda.`,
            });
            break;
          }

          if (isImageSyncingRef.current) {
            for (let sec = 15; sec > 0 && isImageSyncingRef.current; sec--) {
              setMessage({
                type: 'info',
                text: `✅ Chunk #${batchCount} completato (+${data.succeeded || 0} sync). Prossimo chunk tra ${sec} secondi... (Restano: ${currentPending})`,
              });
              await new Promise(r => setTimeout(r, 1000));
            }
          }
        } catch (err: any) {
          if (!isImageSyncingRef.current) break;
          setMessage({
            type: 'error',
            text: `⚠️ Errore nel chunk #${batchCount}: ${err.message}. Riprovo tra 15 secondi...`,
          });
          for (let sec = 15; sec > 0 && isImageSyncingRef.current; sec--) {
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }
    } catch (err) {
      setMessage({ type: 'error', text: `Errore critico: ${(err as Error).message}` });
    } finally {
      setIsImageSyncing(false);
      isImageSyncingRef.current = false;
    }
  };

  const stopImageSync = () => {
    isImageSyncingRef.current = false;
    setIsImageSyncing(false);
    setMessage({ type: 'info', text: '⏸ Sincronizzazione automatica interrotta.' });
  };

  // ─── Categories ────────────────────────────────────────────────────

  const handleRunAutoCategorization = async (onlyCustom = false) => {
    setIsRecategorizing(true);
    setMessage({ type: 'info', text: `⚡ Categorizzazione automatica batch in corso (${onlyCustom ? 'Solo Personalizzati' : 'Tutto il DB'})...` });
    try {
      const res = await fetch('/api/admin/re-categorize-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onlyCustomCategory: onlyCustom })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Errore durante la categorizzazione automatica');
      setMessage({ type: 'success', text: `✨ Categorizzazione completata! ${data.updatedCount} prodotti aggiornati su ${data.totalAnalyzed} analizzati.` });
      fetchCategories();
      fetchLocalProducts(1, pageSize);
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setIsRecategorizing(false);
    }
  };

  const handleStartEdit = (cat: CategoryItem) => {
    setEditingCat(cat);
    setCatLabel(cat.label);
    setCatEmoji(cat.emoji);
    setCatColor(cat.color);
    setIsCreatingCat(true);
  };

  const handleStartCreate = () => {
    setEditingCat(null);
    setCatLabel('');
    setCatEmoji('🏷️');
    setCatColor('#10b981');
    setIsCreatingCat(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catLabel.trim()) return;
    try {
      const url = editingCat ? `/api/admin/categories/${editingCat.id}` : '/api/admin/categories';
      const method = editingCat ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: catLabel, emoji: catEmoji, color: catColor })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Errore salvataggio categoria');
      setMessage({ type: 'success', text: `Categoria "${catLabel}" salvata con successo!` });
      setIsCreatingCat(false);
      setEditingCat(null);
      fetchCategories();
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
    }
  };

  const handleDeleteCategory = async (id: string, label: string) => {
    if (!confirm(`Sei sicuro di voler eliminare la categoria "${label}"? I prodotti associati verranno spostati in Personalizzato.`)) return;
    try {
      const res = await fetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Errore eliminazione categoria');
      setMessage({ type: 'success', text: `Categoria "${label}" eliminata con successo.` });
      fetchCategories();
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
    }
  };

  const handleCleanEmptyCategories = async () => {
    const emptyCount = categories.filter(c => c.count === 0 && c.id !== 'personalizzato').length;
    if (!confirm(`Vuoi eliminare definitivamente ${emptyCount} categorie che hanno 0 prodotti associati?`)) return;
    try {
      const res = await fetch('/api/admin/categories?empty=true', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Errore durante la pulizia');
      setMessage({ type: 'success', text: `🧹 Pulizia completata! Rimosse ${emptyCount} categorie vuote.` });
      fetchCategories();
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
    }
  };

  const handleViewCategoryProducts = async (cat: CategoryItem) => {
    setSelectedCategoryView(cat);
    setIsLoadingCatProducts(true);
    try {
      const res = await fetch(`/api/admin/products?category=${cat.id}`);
      if (!res.ok) throw new Error('Errore nel caricamento prodotti della categoria');
      const data = await res.json();
      setCatProducts(data.products || []);
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setIsLoadingCatProducts(false);
    }
  };

  const handleReassignProductCategory = async (productId: string, newCatId: string) => {
    const targetCat = categories.find(c => c.id === newCatId);
    try {
      const res = await fetch('/api/admin/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, categoryId: newCatId, emoji: targetCat?.emoji || '🌟' }),
      });
      if (!res.ok) throw new Error('Errore durante lo spostamento di categoria');
      setMessage({ type: 'success', text: `Prodotto spostato in ${targetCat?.label || newCatId}` });
      setCatProducts(prev => prev.filter(p => p.id !== productId));
      fetchCategories();
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
    }
  };

  const handleCategorizeSingleProduct = async (p: any) => {
    setClassifyingProductId(p.id);
    try {
      const res = await fetch('/api/admin/re-categorize-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: p.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Errore durante la categorizzazione AI');

      setSingleAiResultModal({
        productId: p.id,
        productName: data.productName || p.name,
        oldCategory: data.oldCategory,
        newCategory: data.newCategory,
        selectedCategoryId: data.newCategory?.id || 'personalizzato',
        selectedCategoryEmoji: data.newCategory?.emoji || '⭐',
        method: data.method,
        confidence: data.confidence,
        topPredictions: data.topPredictions,
      });
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setClassifyingProductId(null);
    }
  };

  const confirmSingleCategorization = async () => {
    if (!singleAiResultModal) return;
    const { productId, selectedCategoryId, selectedCategoryEmoji } = singleAiResultModal;
    try {
      const res = await fetch('/api/admin/re-categorize-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          confirm: true,
          categoryId: selectedCategoryId,
          emoji: selectedCategoryEmoji,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Errore nella conferma');

      setResults(prev => prev.map(item => item.id === productId ? { ...item, category: selectedCategoryId, emoji: selectedCategoryEmoji } : item));

      if (selectedCategoryView) {
        if (selectedCategoryId !== selectedCategoryView.id) {
          setCatProducts(prev => prev.filter(item => item.id !== productId));
        } else {
          setCatProducts(prev => prev.map(item => item.id === productId ? { ...item, category: selectedCategoryId, emoji: selectedCategoryEmoji } : item));
        }
      }

      fetchCategories();
      setSingleAiResultModal(null);
      setMessage({ type: 'success', text: `Prodotto aggiornato con successo a ${selectedCategoryEmoji} ${selectedCategoryId}!` });
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
    }
  };

  // ─── Computed ─────────────────────────────────────────────────────

  const progressPercentage = syncState && syncState.totalPages > 0
    ? Math.round((syncState.currentPage / syncState.totalPages) * 100)
    : 0;

  const imageCoveragePercentage = imageSyncStats && imageSyncStats.total_public > 0
    ? Math.round((imageSyncStats.with_image / imageSyncStats.total_public) * 100)
    : 0;

  const imageProgressPercentage = imageCoveragePercentage;

  // ─── Stili condivisi ──────────────────────────────────────────────

  const tabStyle = (tab: string, color: string) => ({
    padding: '1rem 1.5rem',
    background: activeTab === tab ? 'var(--surface)' : 'transparent',
    border: '1px solid var(--border-color)',
    borderBottom: activeTab === tab ? `3px solid ${color}` : '1px solid var(--border-color)',
    borderRadius: '0.5rem 0.5rem 0 0',
    color: activeTab === tab ? color : 'var(--text-secondary)',
    fontWeight: 700,
    fontSize: '1.05rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease',
  } as React.CSSProperties);

  const progressBarWrap = {
    width: '100%',
    height: '12px',
    background: 'var(--border-color)',
    borderRadius: '6px',
    overflow: 'hidden',
    marginBottom: '1.25rem',
  } as React.CSSProperties;

  return (
    <div>
      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid var(--border-color)', marginBottom: '2rem' }}>
        <button id="tab-products" onClick={() => setActiveTab('products')} style={tabStyle('products', '#3b82f6')}>
          <span>📦</span> Catalogo & Import
        </button>
        <button id="tab-images" onClick={() => setActiveTab('images')} style={tabStyle('images', '#f59e0b')}>
          <span>🖼️</span> Sincronizza Immagini
          {imageSyncStats && imageSyncStats.pending_image > 0 && (
            <span style={{ background: '#f59e0b', color: '#fff', borderRadius: '9999px', fontSize: '0.75rem', padding: '0 6px', fontWeight: 800 }}>
              {imageSyncStats.pending_image}
            </span>
          )}
        </button>
        <button id="tab-categories" onClick={() => setActiveTab('categories')} style={tabStyle('categories', '#10b981')}>
          <span>🏷️</span> Categorie
        </button>
      </div>

      {/* Message banner */}
      {message && (
        <div style={{
          padding: '1rem 1.25rem',
          marginBottom: '2rem',
          borderRadius: '0.75rem',
          backgroundColor: message.type === 'success' ? '#10b98118' : message.type === 'error' ? '#ef444418' : '#3b82f618',
          border: `1px solid ${message.type === 'success' ? '#10b981' : message.type === 'error' ? '#ef4444' : '#3b82f6'}`,
          color: message.type === 'success' ? '#10b981' : message.type === 'error' ? '#ef4444' : '#3b82f6',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.25rem' }}>×</button>
        </div>
      )}

      {singleAiResultModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem'
        }}>
          <div style={{
            background: 'var(--bg-card, #ffffff)', borderRadius: '1.25rem', border: '1px solid #6366f155',
            padding: '2rem', maxWidth: '480px', width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            display: 'flex', flexDirection: 'column', gap: '1.25rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '2.5rem' }}>🤖✨</span>
              <button onClick={() => setSingleAiResultModal(null)} style={{ background: 'var(--bg-base, #f4faf7)', border: '1px solid var(--border-color, #ccc)', borderRadius: '50%', width: '36px', height: '36px', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-primary)' }}>✕</button>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.35rem', color: 'var(--text-primary)' }}>Risultato Categorizzazione AI</h3>
              <p style={{ margin: '0.35rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                Prodotto: <strong style={{ color: 'var(--text-primary)' }}>{singleAiResultModal.productName}</strong>
              </p>
            </div>
            <div style={{ padding: '1.25rem', background: 'var(--bg-base, #f4faf7)', borderRadius: '0.85rem', border: '1px solid var(--border-color, #ccc)', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Categoria precedente:</span>
                <span style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.2rem 0.65rem', borderRadius: '1rem', fontSize: '0.85rem', fontWeight: 600 }}>
                  {singleAiResultModal.oldCategory}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed var(--border-color, #ccc)', paddingTop: '0.75rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Assegna a Categoria:</span>
                <select
                  value={singleAiResultModal.selectedCategoryId}
                  onChange={(e) => {
                    const selectedCat = categories.find(c => c.id === e.target.value);
                    setSingleAiResultModal({
                      ...singleAiResultModal,
                      selectedCategoryId: e.target.value,
                      selectedCategoryEmoji: selectedCat ? selectedCat.emoji : '📦',
                    });
                  }}
                  style={{
                    background: 'var(--bg-card, #ffffff)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color, #ccc)',
                    borderRadius: '0.5rem',
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.88rem',
                    fontWeight: 700
                  }}
                >
                  <option value="personalizzato">⭐ Personalizzato</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.emoji} {cat.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ borderTop: '1px dashed var(--border-color, #ccc)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <span>Metodo: <strong style={{ color: 'var(--text-primary)' }}>{singleAiResultModal.method}</strong></span>
                <span>Affidabilità: <strong style={{ color: '#6366f1' }}>{singleAiResultModal.confidence}%</strong></span>
              </div>
              {singleAiResultModal.topPredictions && singleAiResultModal.topPredictions.length > 0 && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'var(--bg-card, #ffffff)', padding: '0.65rem', borderRadius: '0.5rem', marginTop: '0.25rem' }}>
                  <strong style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--text-primary)' }}>Top Rilevamenti Visivi AI:</strong>
                  {singleAiResultModal.topPredictions.map((pred: any, i: number) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', margin: '0.15rem 0' }}>
                      <span>• {pred.label}</span>
                      <strong style={{ color: '#6366f1' }}>{Math.round(pred.score * 100)}%</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => setSingleAiResultModal(null)}
                style={{
                  flex: 1,
                  padding: '0.85rem',
                  borderRadius: '0.75rem',
                  border: '1px solid var(--border-color, #ccc)',
                  background: 'var(--bg-base, #f4faf7)',
                  color: 'var(--text-primary)',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                ❌ Annulla
              </button>
              <button
                onClick={confirmSingleCategorization}
                className="btn-primary"
                style={{
                  flex: 1.5,
                  background: '#10b981',
                  borderColor: '#10b981',
                  padding: '0.85rem',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                ✅ Conferma
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 1: PRODOTTI ─────────────────────────────────────────── */}
      {activeTab === 'products' && (
        <div>
          <div style={{ marginBottom: '2rem', padding: '1.5rem', background: 'var(--surface)', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}>
            <h2 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1.25rem' }}>Importazione Prodotti da OpenFoodFacts</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
              Importa solo i dati testuali (nome, categoria, nutrizione, ecc.). Le immagini vengono sincronizzate separatamente nel tab <strong>🖼️ Sincronizza Immagini</strong>.
            </p>

            {syncState ? (
              <div style={{ padding: '1.25rem', background: 'var(--bg)', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 600 }}>
                  <span>Query: {syncState.query ? `"${syncState.query}"` : 'Generale'}</span>
                  <span>{progressPercentage}% — Pagina {syncState.currentPage} / {syncState.totalPages}</span>
                </div>

                <div style={progressBarWrap}>
                  <div style={{ width: `${progressPercentage}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6, #6366f1)', transition: 'width 0.4s ease', borderRadius: '6px' }} />
                </div>

                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  {syncState.totalProducts > 0 ? `${syncState.totalProducts.toLocaleString()} prodotti totali` : ''}
                </p>

                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  {isSyncing ? (
                    <button onClick={stopSync} className="btn-primary" style={{ background: '#ef4444', borderColor: '#ef4444' }}>
                      ⏸ Pausa
                    </button>
                  ) : (
                    <>
                      <button onClick={() => startOrResumeSync()} className="btn-primary" style={{ background: '#10b981', borderColor: '#10b981' }}>
                        ▶ Riavvia Import
                      </button>
                      <button onClick={clearSync} style={{ padding: '0.6rem 1.25rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '0.5rem', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}>
                        Annulla
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={(e) => startOrResumeSync(e)} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <input
                  id="off-search-query"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="es. 'soia' (lascia vuoto per importare i prodotti generali)"
                  disabled={isSyncing}
                  style={{ flex: '1 1 300px', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', background: 'var(--bg)', color: 'var(--text-primary)', fontSize: '1rem' }}
                />
                <button id="btn-start-import" type="submit" disabled={isSyncing} className="btn-primary" style={{ padding: '0.75rem 2rem' }}>
                  {isSyncing ? '⏳ In corso...' : '🔍 Cerca e Avvia'}
                </button>
              </form>
            )}
          </div>

          {!isSyncing && isLoading && <div style={{ textAlign: 'center', padding: '3rem' }}>⏳ Caricamento prodotti...</div>}

          {!isLoading && results.length > 0 && (
            <div style={{ overflowX: 'auto', background: 'var(--surface)', borderRadius: '0.75rem', border: '1px solid var(--border-color)', padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Prodotti nel Catalogo ({totalCount.toLocaleString()})</h2>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(parseInt(e.target.value))}
                  style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', background: 'var(--bg)', color: 'var(--text-primary)' }}
                >
                  <option value={10}>10 per pagina</option>
                  <option value={25}>25 per pagina</option>
                  <option value={50}>50 per pagina</option>
                  <option value={100}>100 per pagina</option>
                </select>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                    <th style={{ padding: '1rem 0.75rem' }}>Img</th>
                    <th style={{ padding: '1rem 0.75rem' }}>Prodotto</th>
                    <th style={{ padding: '1rem 0.75rem' }}>ID / Barcode</th>
                    <th style={{ padding: '1rem 0.75rem' }}>Categoria</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem' }}>
                        {(p.enrichment?.imageUrl) ? (
                          <img src={p.enrichment.imageUrl} alt="" style={{ width: '42px', height: '42px', objectFit: 'cover', borderRadius: '6px' }} />
                        ) : (
                          <div style={{ width: '42px', height: '42px', background: 'var(--bg)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>
                            {p.emoji || '🛒'}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <strong style={{ display: 'block', marginBottom: '0.2rem' }}>{p.name}</strong>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{p.enrichment?.brand || p.description}</span>
                      </td>
                      <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>{p.id}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'var(--bg)', padding: '0.25rem 0.75rem', borderRadius: '1rem', fontSize: '0.85rem', fontWeight: 600, border: '1px solid var(--border-color)' }}>
                            <span>{p.emoji}</span> {p.category}
                          </span>
                          <button
                            onClick={() => handleCategorizeSingleProduct(p)}
                            disabled={classifyingProductId === p.id}
                            title="Lancia categorizzazione AI sul singolo prodotto"
                            style={{ padding: '0.3rem 0.65rem', borderRadius: '0.5rem', border: '1px solid #6366f155', background: '#6366f115', color: '#6366f1', cursor: classifyingProductId === p.id ? 'wait' : 'pointer', fontSize: '0.8rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                          >
                            {classifyingProductId === p.id ? '⏳ AI...' : '🤖 AI'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {totalCount > pageSize && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '2rem', gap: '1rem' }}>
                  <button onClick={() => fetchLocalProducts(page - 1, pageSize)} disabled={isLoading || page === 1}
                    style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', background: 'var(--bg)', color: 'var(--text-primary)', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}>
                    ← Precedente
                  </button>
                  <span style={{ fontWeight: 700 }}>Pagina {page} di {Math.ceil(totalCount / pageSize) || 1}</span>
                  <button onClick={() => fetchLocalProducts(page + 1, pageSize)} disabled={isLoading || page >= Math.ceil(totalCount / pageSize)}
                    style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', background: 'var(--bg)', color: 'var(--text-primary)', cursor: page >= Math.ceil(totalCount / pageSize) ? 'not-allowed' : 'pointer', opacity: page >= Math.ceil(totalCount / pageSize) ? 0.5 : 1 }}>
                    Successiva →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: IMMAGINI ─────────────────────────────────────────── */}
      {activeTab === 'images' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* Statistiche Immagini */}
          {imageSyncStats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem' }}>
              {[
                { label: 'Prodotti pubblici', value: imageSyncStats.total_public.toLocaleString(), icon: '📦', color: '#3b82f6' },
                { label: 'Con immagine Cloudinary', value: imageSyncStats.with_image.toLocaleString(), icon: '✅', color: '#10b981' },
                { label: 'Da sincronizzare', value: imageSyncStats.pending_image.toLocaleString(), icon: '⏳', color: imageSyncStats.pending_image > 0 ? '#f59e0b' : '#10b981' },
              ].map(stat => (
                <div key={stat.label} style={{ padding: '1.25rem 1.5rem', background: 'var(--surface)', borderRadius: '0.75rem', border: `1px solid ${stat.color}33` }}>
                  <div style={{ fontSize: '1.75rem', marginBottom: '0.4rem' }}>{stat.icon}</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: stat.color }}>{stat.value}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{stat.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Copertura Immagini */}
          <div style={{ padding: '1.5rem', background: 'var(--surface)', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Copertura immagini su Cloudinary</h3>
              <span style={{ fontWeight: 700, fontSize: '1.1rem', color: imageCoveragePercentage >= 90 ? '#10b981' : imageCoveragePercentage >= 50 ? '#f59e0b' : '#ef4444' }}>
                {imageCoveragePercentage}%
              </span>
            </div>
            <div style={progressBarWrap}>
              <div style={{
                width: `${imageCoveragePercentage}%`,
                height: '100%',
                background: imageCoveragePercentage >= 90
                  ? 'linear-gradient(90deg, #10b981, #059669)'
                  : imageCoveragePercentage >= 50
                    ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                    : 'linear-gradient(90deg, #ef4444, #dc2626)',
                transition: 'width 0.4s ease',
                borderRadius: '6px',
              }} />
            </div>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: 0 }}>
              {imageSyncStats
                ? `${imageSyncStats.with_image} di ${imageSyncStats.total_public} prodotti hanno l'immagine caricata su Cloudinary`
                : 'Caricamento statistiche...'}
            </p>
          </div>

          {/* Controllo sync immagini */}
          <div style={{ padding: '1.5rem', background: 'var(--surface)', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}>
            <h2 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1.25rem' }}>Sincronizzazione Manuale Immagini su Cloudinary</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
              Avvia la sincronizzazione manualmente a chunk (predefinito <strong>10 prodotti per volta</strong>) per evitare errori 429 (rate limit).
              I prodotti con immagine già sincronizzata vengono ignorati a monte dalla chiamata.
            </p>

            {/* Progress durante sync */}
            {(isImageSyncing || imageSyncState) && (
              <div style={{ padding: '1.25rem', background: 'var(--bg)', borderRadius: '0.5rem', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 600 }}>
                  <span>
                    {isImageSyncing ? `⚡ Sincronizzazione di ${imageChunkSize} immagini in corso...` : 'Sincronizzazione chunk completata'}
                  </span>
                  <span>
                    {imageProgressPercentage}% — Completati {imageSyncStats?.with_image ?? 0} su {imageSyncStats?.total_public ?? '?'}
                  </span>
                </div>

                <div style={progressBarWrap}>
                  <div style={{
                    width: `${imageProgressPercentage}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #f59e0b, #10b981)',
                    transition: 'width 0.4s ease',
                    borderRadius: '6px',
                  }} />
                </div>

                <div style={{ display: 'flex', gap: '2rem', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                  <span>✅ Sincronizzate (sessione): <strong style={{ color: '#10b981' }}>{imageSyncState?.succeeded ?? 0}</strong></span>
                  <span>❌ Errori/Vuote (sessione): <strong style={{ color: '#ef4444' }}>{imageSyncState?.failed ?? 0}</strong></span>
                  <span>⏳ Rimanenti totali: <strong style={{ color: '#f59e0b' }}>{imageSyncStats?.pending_image ?? '?'}</strong></span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label htmlFor="select-chunk-size" style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Chunk:</label>
                <select
                  id="select-chunk-size"
                  value={imageChunkSize}
                  onChange={(e) => setImageChunkSize(parseInt(e.target.value, 10))}
                  disabled={isImageSyncing}
                  style={{ padding: '0.65rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', background: 'var(--bg)', color: 'var(--text-primary)', fontWeight: 600 }}
                >
                  <option value={10}>10 elementi</option>
                  <option value={20}>20 elementi</option>
                  <option value={50}>50 elementi</option>
                </select>
              </div>

              {isImageSyncing ? (
                <button
                  id="btn-stop-image-sync"
                  onClick={stopImageSync}
                  className="btn-primary"
                  style={{
                    background: '#ef4444',
                    borderColor: '#ef4444',
                    padding: '0.75rem 1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  ⏸ Ferma Sincronizzazione
                </button>
              ) : (
                <button
                  id="btn-start-image-sync"
                  onClick={startImageSync}
                  disabled={imageSyncStats?.pending_image === 0}
                  className="btn-primary"
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    borderColor: '#f59e0b',
                    opacity: imageSyncStats?.pending_image === 0 ? 0.6 : 1,
                    padding: '0.75rem 1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  {imageSyncStats?.pending_image === 0
                    ? '✅ Tutte le immagini sono già sincronizzate'
                    : `▶ Avvia Sincronizzazione Automatica (${imageChunkSize} per volta, pausa 15s)`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: CATEGORIE ────────────────────────────────────────── */}
      {/* ── TAB 3: CATEGORIE ────────────────────────────────────────── */}
      {activeTab === 'categories' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {selectedCategoryView ? (
            /* Vista di Verifica Prodotti nella Categoria */
            <div style={{ background: 'var(--surface)', borderRadius: '1rem', border: '1px solid var(--border-color)', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <button onClick={() => setSelectedCategoryView(null)}
                    style={{ padding: '0.65rem 1.2rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', background: 'var(--bg)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    ⬅️ Torna alle Categorie
                  </button>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.8rem' }}>{selectedCategoryView.emoji}</span>
                      {selectedCategoryView.label}
                    </h2>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      ID: <code>{selectedCategoryView.id}</code> • {catProducts.length} prodotti presenti
                    </span>
                  </div>
                </div>
              </div>

              {isLoadingCatProducts ? (
                <div style={{ textAlign: 'center', padding: '3rem', fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
                  ⏳ Caricamento prodotti per verifica in corso...
                </div>
              ) : catProducts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', background: 'var(--bg)', borderRadius: '0.75rem', border: '1px dashed var(--border-color)' }}>
                  <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem' }}>📂</span>
                  <strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>Nessun prodotto assegnato a questa categoria.</strong>
                  <p style={{ margin: '0.35rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Puoi eseguire la categorizzazione batch automatica o spostare manualmente i prodotti da altre categorie.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '1.25rem' }}>
                  {catProducts.map((p) => (
                    <div key={p.id} style={{ padding: '1rem', background: 'var(--bg)', borderRadius: '0.75rem', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.75rem', justifyContent: 'space-between', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                      <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center' }}>
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt={p.name} style={{ width: '60px', height: '60px', borderRadius: '0.5rem', objectFit: 'cover', border: '1px solid var(--border-color)', flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: '60px', height: '60px', borderRadius: '0.5rem', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', flexShrink: 0 }}>
                            {p.emoji || '🌟'}
                          </div>
                        )}
                        <div style={{ overflow: 'hidden', flex: 1 }}>
                          <strong style={{ fontSize: '0.95rem', display: 'block', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {p.name || 'Prodotto senza nome'}
                          </strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', wordBreak: 'break-all', display: 'block' }}>
                            ID: {p.id}
                          </span>
                        </div>
                      </div>

                      {p.tags && p.tags.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          {p.tags.slice(0, 4).map((tag: string, idx: number) => (
                            <span key={idx} style={{ fontSize: '0.75rem', background: 'var(--bg-base, #f4faf7)', padding: '0.15rem 0.5rem', borderRadius: '999px', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}

                      <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Sposta in:</span>
                          <select
                            value={selectedCategoryView.id}
                            onChange={(e) => handleReassignProductCategory(p.id, e.target.value)}
                            style={{ padding: '0.35rem 0.6rem', borderRadius: '0.4rem', border: '1px solid var(--border-color)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', flex: 1 }}
                          >
                            {categories.map((cItem) => (
                              <option key={cItem.id} value={cItem.id}>
                                {cItem.emoji} {cItem.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          onClick={() => handleCategorizeSingleProduct(p)}
                          disabled={classifyingProductId === p.id}
                          title="Esegui classificazione AI su questo singolo prodotto"
                          style={{ width: '100%', padding: '0.45rem', borderRadius: '0.45rem', border: '1px solid #6366f155', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.15))', color: '#6366f1', cursor: classifyingProductId === p.id ? 'wait' : 'pointer', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                        >
                          {classifyingProductId === p.id ? '⏳ Analisi AI in corso...' : '🤖 Categorizza Singolo (AI)'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Box Categorizzazione Batch & Elenco Categorie */
            <>
              {/* Box Categorizzazione Batch */}
              <div style={{
                padding: '1.75rem',
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(16, 185, 129, 0.15))',
                borderRadius: '1rem',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '2rem' }}>🤖⚡</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.3rem', color: 'var(--text-primary)' }}>Categorizzazione AI Visuale & Batch</h3>
                    <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                      Esegui l&apos;algoritmo di classificazione visuale AI (MobileNet v2) sulle immagini preesistenti dei prodotti e analisi NLP testuale.
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  <button onClick={() => handleRunAutoCategorization(true)} disabled={isRecategorizing} className="btn-primary"
                    style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', padding: '0.85rem 1.5rem', fontSize: '0.95rem', fontWeight: 700, boxShadow: '0 4px 12px rgba(245, 158, 11, 0.25)', flex: '1 1 auto' }}>
                    {isRecategorizing ? '⏳ Elaborazione...' : '🎯 Categorizza Solo "Personalizzato"'}
                  </button>
                  <button onClick={() => handleRunAutoCategorization(false)} disabled={isRecategorizing} className="btn-primary"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', padding: '0.85rem 1.5rem', fontSize: '0.95rem', fontWeight: 700, boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)', flex: '1 1 auto' }}>
                    {isRecategorizing ? '⏳ Elaborazione...' : '🔄 Categorizza Tutto il Database'}
                  </button>
                </div>
              </div>

              {/* Elenco Categorie */}
              <div style={{ background: 'var(--surface)', borderRadius: '1rem', border: '1px solid var(--border-color)', padding: '1.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.35rem' }}>Elenco Categorie DB ({categories.length})</h2>
                    <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Clicca su &quot;Verifica&quot; per controllare i singoli prodotti di una categoria.</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {categories.some(c => c.count === 0 && c.id !== 'personalizzato') && (
                      <button onClick={handleCleanEmptyCategories}
                        style={{ padding: '0.65rem 1.2rem', borderRadius: '0.5rem', border: '1px solid #f59e0b', background: '#f59e0b18', color: '#f59e0b', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.95rem' }}>
                        🧹 Rimuovi Categorie Vuote
                      </button>
                    )}
                    <button onClick={handleStartCreate} className="btn-primary"
                      style={{ background: '#10b981', borderColor: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      ➕ Nuova Categoria
                    </button>
                  </div>
                </div>

                {isCreatingCat && (
                  <form onSubmit={handleSaveCategory} style={{
                    padding: '1.5rem', background: 'var(--bg)', borderRadius: '0.75rem', border: '1px solid #10b98155',
                    marginBottom: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', alignItems: 'end',
                  }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Nome Categoria</label>
                      <input type="text" required value={catLabel} onChange={e => setCatLabel(e.target.value)} placeholder="es. Dolci Senza Glutine"
                        style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', background: 'var(--surface)', color: 'var(--text-primary)' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Emoji Icona</label>
                      <input type="text" required maxLength={4} value={catEmoji} onChange={e => setCatEmoji(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', background: 'var(--surface)', color: 'var(--text-primary)', textAlign: 'center', fontSize: '1.25rem' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Colore Badge</label>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input type="color" value={catColor} onChange={e => setCatColor(e.target.value)}
                          style={{ width: '45px', height: '42px', padding: 0, border: 'none', borderRadius: '0.5rem', cursor: 'pointer', background: 'transparent' }} />
                        <input type="text" value={catColor} onChange={e => setCatColor(e.target.value)}
                          style={{ width: '100px', padding: '0.65rem 0.5rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', background: 'var(--surface)', color: 'var(--text-primary)', fontFamily: 'monospace' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button type="submit" className="btn-primary" style={{ flex: 1, background: '#10b981', borderColor: '#10b981' }}>💾 Salva</button>
                      <button type="button" onClick={() => setIsCreatingCat(false)}
                        style={{ padding: '0.65rem 1rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '0.5rem', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}>
                        Annulla
                      </button>
                    </div>
                  </form>
                )}

                {isLoadingCats ? (
                  <div style={{ textAlign: 'center', padding: '3rem' }}>⏳ Caricamento categorie...</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
                    {categories.map(c => (
                      <div key={c.id} style={{ padding: '1.25rem', background: 'var(--bg)', borderRadius: '0.75rem', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                            <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: `${c.color}25`, border: `1.5px solid ${c.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', boxShadow: `0 2px 8px ${c.color}20` }}>
                              {c.emoji}
                            </div>
                            <div>
                              <strong style={{ fontSize: '1.1rem', display: 'block', color: 'var(--text-primary)' }}>{c.label}</strong>
                              <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{c.id}</span>
                            </div>
                          </div>
                          <span style={{ background: 'var(--surface)', padding: '0.2rem 0.65rem', borderRadius: '1rem', fontSize: '0.8rem', fontWeight: 700, color: c.count > 0 ? '#3b82f6' : 'var(--text-secondary)', border: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>
                            {c.count} prod.
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px dashed var(--border-color)', paddingTop: '0.85rem', flexWrap: 'wrap' }}>
                          <button onClick={() => handleViewCategoryProducts(c)}
                            style={{ padding: '0.4rem 0.85rem', borderRadius: '0.4rem', border: '1px solid #3b82f644', background: '#3b82f612', color: '#3b82f6', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 }}>
                            👁️ Verifica ({c.count})
                          </button>
                          <button onClick={() => handleStartEdit(c)}
                            style={{ padding: '0.4rem 0.85rem', borderRadius: '0.4rem', border: '1px solid var(--border-color)', background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                            ✏️ Modifica
                          </button>
                          {c.id !== 'personalizzato' && (
                            <button onClick={() => handleDeleteCategory(c.id, c.label)}
                              style={{ padding: '0.4rem 0.85rem', borderRadius: '0.4rem', border: '1px solid #ef444444', background: '#ef444412', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                              🗑️ Elimina
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
