import { auth } from '@/lib/auth';
import { ensureSchema, getDb } from '@/lib/db';
import { OpenFoodFactsProvider } from '@/lib/product-enrichment/providers/open-food-facts';
import fs from 'fs';
import path from 'path';
import { createGunzip } from 'zlib';
import readline from 'readline';
import https from 'https';
import http from 'http';

// ─── Costanti ─────────────────────────────────────────────────────────────

const OFF_DUMP_URL = 'https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz';
const DUMP_FILENAME = 'openfoodfacts-products.jsonl.gz';
const FILTERED_FILENAME = 'gluten-free-products.jsonl';
const BATCH_SIZE = 500;

// ─── Helpers ──────────────────────────────────────────────────────────────

type SendFn = (event: string, data: object) => void;

/** Filtro prodotti gluten-free italiani */
function isGlutenFreeItalian(p: any): boolean {
  const labels: string[] = Array.isArray(p.labels_tags) ? p.labels_tags : [];
  const allergens: string[] = Array.isArray(p.allergens_tags) ? p.allergens_tags : [];
  const countries: string[] = Array.isArray(p.countries_tags) ? p.countries_tags : [];
  return (
    (labels.includes('en:gluten-free') || labels.includes('en:no-gluten')) &&
    !allergens.includes('en:gluten') &&
    countries.includes('en:italy')
  );
}

/** Mappa il prodotto grezzo OFF al formato riga DB */
const provider = new OpenFoodFactsProvider();
function mapToDbRow(p: any) {
  const labels: string[] = Array.isArray(p.labels_tags) ? p.labels_tags : [];
  const allergens: string[] = Array.isArray(p.allergens_tags) ? p.allergens_tags : [];
  const hasGluten = allergens.includes('en:gluten');
  const isGlutenFree = labels.includes('en:gluten-free') || labels.includes('en:no-gluten');
  const name = p.product_name_it || p.product_name || p.brands || 'Prodotto Sconosciuto';
  const description = p.ingredients_text_it || p.ingredients_text || '';
  const catInfo = provider.categorizeProduct(p);
  return {
    id: p.code,
    name_enc: name,
    description_enc: description,
    category: catInfo.id,
    emoji: catInfo.emoji,
    categoryLabel: catInfo.label,
    categoryColor: catInfo.color,
    tags: labels,
    gluten_level: (isGlutenFree || !hasGluten) ? 'none' : 'trace',
    is_gluten_free: isGlutenFree || !hasGluten,
    off_image_url: p.image_url || p.image_front_small_url || null,
    nutriscore: p.nutriscore_grade ? String(p.nutriscore_grade).toLowerCase() : null,
    nova_group: p.nova_group || null,
    ecoscore: p.ecoscore_grade ? String(p.ecoscore_grade).toLowerCase() : null,
    allergens,
    ingredients_text: description || null,
    brand: p.brands || null,
    quantity: p.quantity || null,
  };
}

/** Formatta bytes in stringa leggibile */
function fmtBytes(bytes: number): string {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  return (bytes / 1e3).toFixed(0) + ' KB';
}

// ─── Fase 1: Download ──────────────────────────────────────────────────────

async function phase1Download(
  send: SendFn,
  dumpPath: string,
  isCancelled: () => boolean,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let initialBytes = 0;
    if (fs.existsSync(dumpPath)) {
      initialBytes = fs.statSync(dumpPath).size;
    }

    const doRequest = (url: string, redirectCount = 0) => {
      if (redirectCount > 5) return reject(new Error('Troppi redirect HTTP'));
      if (isCancelled()) return reject(new Error('CANCELLED'));

      const parsed = new URL(url);
      const mod = parsed.protocol === 'https:' ? https : http;

      const reqOptions: any = {
        headers: { 'User-Agent': 'gluten-free-app/1.0 - https://github.com/marvix89/gluten-free' }
      };
      
      if (initialBytes > 0) {
        reqOptions.headers['Range'] = `bytes=${initialBytes}-`;
      }

      const req = (mod as typeof https).get(url, reqOptions, (res) => {
        // Gestione redirect
        if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          doRequest(res.headers.location, redirectCount + 1);
          return;
        }

        if (res.statusCode !== 200 && res.statusCode !== 206) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        const isResume = res.statusCode === 206;
        const totalBytes = parseInt(res.headers['content-length'] || '0', 10) + (isResume ? initialBytes : 0);
        let downloadedBytes = isResume ? initialBytes : 0;
        let lastReport = Date.now();
        let startTime = Date.now();
        let bytesSinceStart = 0;

        const fileStream = fs.createWriteStream(dumpPath, { flags: isResume ? 'a' : 'w' });

        res.on('data', (chunk: Buffer) => {
          if (isCancelled()) {
            req.destroy();
            fileStream.destroy();
            reject(new Error('CANCELLED'));
            return;
          }
          downloadedBytes += chunk.length;
          bytesSinceStart += chunk.length;
          const now = Date.now();
          if (now - lastReport > 2000) {
            const elapsed = (now - startTime) / 1000;
            const speedBps = bytesSinceStart / elapsed;
            const pct = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : -1;
            const eta = totalBytes > 0 && speedBps > 0
              ? Math.round((totalBytes - downloadedBytes) / speedBps)
              : -1;
            send('progress', {
              phase: 1,
              pct,
              downloadedBytes,
              totalBytes,
              message: `⬇️ ${fmtBytes(downloadedBytes)} / ${totalBytes > 0 ? fmtBytes(totalBytes) : '?'} · ${fmtBytes(speedBps)}/s${pct >= 0 ? ` · ${pct}%` : ''}${eta > 0 ? ` · ETA ~${Math.floor(eta / 60)}m${eta % 60}s` : ''}`,
            });
            lastReport = now;
          }
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          if (isCancelled()) {
            try { fs.unlinkSync(dumpPath); } catch { /* ignore */ }
            reject(new Error('CANCELLED'));
          } else {
            resolve();
          }
        });

        fileStream.on('error', reject);
        res.on('error', reject);
      });

      req.on('error', reject);
    };

    doRequest(OFF_DUMP_URL);
  });
}

// ─── Fase 2: Filtraggio ────────────────────────────────────────────────────

async function phase2Filter(
  send: SendFn,
  dumpPath: string,
  filteredPath: string,
  isCancelled: () => boolean,
): Promise<{ totalRead: number; totalWritten: number; totalErrors: number }> {
  const fileStream = fs.createReadStream(dumpPath);
  const inputStream = fileStream.pipe(createGunzip());
  const rl = readline.createInterface({ input: inputStream, crlfDelay: Infinity });
  const outputStream = fs.createWriteStream(filteredPath, { encoding: 'utf8' });

  let totalRead = 0;
  let totalWritten = 0;
  let totalErrors = 0;
  let lastReport = Date.now();

  try {
    for await (const line of rl) {
      if (isCancelled()) {
        rl.close();
        outputStream.destroy();
        try { fs.unlinkSync(filteredPath); } catch { /* ignore */ }
        throw new Error('CANCELLED');
      }
      if (!line.trim()) continue;
      totalRead++;

      try {
        const product = JSON.parse(line);
        if (!isGlutenFreeItalian(product)) continue;
        const row = mapToDbRow(product);
        if (!row.id || !row.name_enc || row.name_enc === 'Prodotto Sconosciuto') continue;
        outputStream.write(JSON.stringify(row) + '\n');
        totalWritten++;
      } catch {
        totalErrors++;
      }

      const now = Date.now();
      if (now - lastReport > 3000) {
        send('progress', {
          phase: 2,
          pct: -1,
          totalRead,
          totalWritten,
          message: `🔍 Lette ${totalRead.toLocaleString('it-IT')} righe · ${totalWritten.toLocaleString('it-IT')} prodotti gluten-free trovati`,
        });
        lastReport = now;
      }
    }
  } finally {
    await new Promise<void>((res) => outputStream.end(res));
  }

  return { totalRead, totalWritten, totalErrors };
}

// ─── Fase 3: Import DB ─────────────────────────────────────────────────────

async function phase3Import(
  send: SendFn,
  filteredPath: string,
  totalProductsEstimate: number,
  ctx: { totalImported: number; totalErrors: number },
  isCancelled: () => boolean,
): Promise<void> {
  await ensureSchema();
  const sql = getDb();

  const fileStream = fs.createReadStream(filteredPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let batch: ReturnType<typeof mapToDbRow>[] = [];
  const categoriesSeen = new Set<string>();

  const flushBatch = async (b: ReturnType<typeof mapToDbRow>[]) => {
    if (b.length === 0) return;

    const newCats = b.filter(r => !categoriesSeen.has(r.category));
    newCats.forEach(r => categoriesSeen.add(r.category));

    const catQueries = [...new Map(newCats.map(r => [r.category, r])).values()].map(r => sql`
      INSERT INTO categories (id, label, emoji, color)
      VALUES (${r.category}, ${r.categoryLabel || r.category}, ${r.emoji}, ${r.categoryColor || '#6366f1'})
      ON CONFLICT (id) DO NOTHING
    `);

    const productQueries = b.map(r => sql`
      INSERT INTO products (
        id, name_enc, description_enc, category, emoji, tags,
        gluten_level, is_gluten_free, is_custom, user_id,
        off_image_url, nutriscore, nova_group,
        ecoscore, allergens, ingredients_text, brand, quantity
      ) VALUES (
        ${r.id}, ${r.name_enc}, ${r.description_enc}, ${r.category}, ${r.emoji}, ${r.tags},
        ${r.gluten_level}, ${r.is_gluten_free}, ${false}, ${null},
        ${r.off_image_url}, ${r.nutriscore}, ${r.nova_group},
        ${r.ecoscore}, ${r.allergens}, ${r.ingredients_text}, ${r.brand}, ${r.quantity}
      )
      ON CONFLICT (id) DO UPDATE SET
        name_enc = EXCLUDED.name_enc,
        description_enc = EXCLUDED.description_enc,
        category = EXCLUDED.category,
        emoji = EXCLUDED.emoji,
        tags = EXCLUDED.tags,
        gluten_level = EXCLUDED.gluten_level,
        is_gluten_free = EXCLUDED.is_gluten_free,
        off_image_url = COALESCE(EXCLUDED.off_image_url, products.off_image_url),
        cloudinary_public_id = COALESCE(products.cloudinary_public_id, NULL),
        nutriscore = EXCLUDED.nutriscore,
        nova_group = EXCLUDED.nova_group,
        ecoscore = EXCLUDED.ecoscore,
        allergens = EXCLUDED.allergens,
        ingredients_text = EXCLUDED.ingredients_text,
        brand = EXCLUDED.brand,
        quantity = EXCLUDED.quantity
    `);

    await sql.transaction([...catQueries, ...productQueries]);
    ctx.totalImported += b.length;
  };

  let lastReport = Date.now();

  for await (const line of rl) {
    if (isCancelled()) {
      rl.close();
      // Flush il batch corrente prima di uscire (i dati già processati vengono salvati)
      try { await flushBatch(batch); batch = []; } catch { /* ignore */ }
      throw new Error('CANCELLED_IMPORT');
    }
    if (!line.trim()) continue;

    try {
      const row = JSON.parse(line);
      batch.push(row);

      if (batch.length >= BATCH_SIZE) {
        await flushBatch(batch);
        batch = [];
        const pct = totalProductsEstimate > 0
          ? Math.min(99, Math.round((ctx.totalImported / totalProductsEstimate) * 100))
          : -1;
        const now = Date.now();
        if (now - lastReport > 1500) {
          send('progress', {
            phase: 3,
            pct,
            totalImported: ctx.totalImported,
            message: `💾 Importati ${ctx.totalImported.toLocaleString('it-IT')} / ${totalProductsEstimate > 0 ? totalProductsEstimate.toLocaleString('it-IT') : '?'} prodotti${pct >= 0 ? ` (${pct}%)` : ''}`,
          });
          lastReport = now;
        }
      }
    } catch {
      ctx.totalErrors++;
    }
  }

  // Ultimo batch
  if (batch.length > 0) {
    await flushBatch(batch);
  }
}

// ─── POST Handler ──────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return Response.json({ error: 'Accesso negato' }, { status: 403 });
  }

  let outputDir: string;
  let startFromPhase: number;
  let forceRestart = false;
  try {
    const body = await request.json();
    outputDir = body.outputDir?.trim();
    startFromPhase = parseInt(body.startFromPhase || '1', 10);
    forceRestart = !!body.forceRestart;
    if (!outputDir) throw new Error('outputDir mancante');
  } catch {
    return Response.json({ error: 'Body non valido: specificare outputDir' }, { status: 400 });
  }

  const resolvedDir = path.resolve(outputDir);
  const dumpPath = path.join(resolvedDir, DUMP_FILENAME);
  const filteredPath = path.join(resolvedDir, FILTERED_FILENAME);

  if (forceRestart) {
    try { if (fs.existsSync(dumpPath)) fs.unlinkSync(dumpPath); } catch { /* ignore */ }
    try { if (fs.existsSync(filteredPath)) fs.unlinkSync(filteredPath); } catch { /* ignore */ }
  }

  // Flag di cancellazione collegato al disconnect del client
  let cancelled = false;
  request.signal.addEventListener('abort', () => { cancelled = true; });
  const isCancelled = () => cancelled;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send: SendFn = (event, data) => {
        if (cancelled) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { /* controller già chiuso */ }
      };

      const ctx = { totalImported: 0, totalErrors: 0 };

      try {
        // Crea cartella se non esiste
        if (!fs.existsSync(resolvedDir)) {
          fs.mkdirSync(resolvedDir, { recursive: true });
        }

        // ══ FASE 1: DOWNLOAD ═══════════════════════════════════════════════
        if (startFromPhase <= 1) {
          const dumpExists = fs.existsSync(dumpPath);
          if (dumpExists) {
            const sz = fmtBytes(fs.statSync(dumpPath).size);
            send('phase_start', { phase: 1, skipped: true, message: `⏭ Dump già presente (${sz}) — salto il download` });
            send('phase_done', { phase: 1, skipped: true, message: `⏭ Download saltato (${sz})` });
          } else {
            send('phase_start', { phase: 1, message: '⬇️ Avvio download dump OpenFoodFacts (~25-40 GB)...' });
            try {
              await phase1Download(send, dumpPath, isCancelled);
              const sz = fmtBytes(fs.statSync(dumpPath).size);
              send('phase_done', { phase: 1, message: `✅ Download completato (${sz})` });
            } catch (err: any) {
              if (err.message === 'CANCELLED') {
                send('cancelled', { phase: 1, resumeFromPhase: 1, message: '⏸ Download interrotto. Il file parziale è stato conservato e verrà ripreso al prossimo avvio.' });
                return;
              }
              throw err;
            }
          }
        } else {
          send('phase_start', { phase: 1, skipped: true, message: '⏭ Fase 1 saltata' });
          send('phase_done', { phase: 1, skipped: true, message: '⏭ Download saltato' });
        }

        if (isCancelled()) { send('cancelled', { resumeFromPhase: 1, message: '⏸ Pipeline interrotta.' }); return; }

        // ══ FASE 2: FILTRAGGIO ═════════════════════════════════════════════
        let filterStats = { totalRead: 0, totalWritten: 0, totalErrors: 0 };

        if (startFromPhase <= 2) {
          if (!fs.existsSync(dumpPath)) {
            throw new Error(`File dump non trovato: ${dumpPath}. Avvia la pipeline dall'inizio.`);
          }
          send('phase_start', { phase: 2, message: '🔍 Filtraggio prodotti gluten-free italiani in corso...' });
          try {
            filterStats = await phase2Filter(send, dumpPath, filteredPath, isCancelled);
            send('phase_done', {
              phase: 2,
              ...filterStats,
              message: `✅ Filtraggio completato: ${filterStats.totalWritten.toLocaleString('it-IT')} prodotti gluten-free italiani su ${filterStats.totalRead.toLocaleString('it-IT')} righe`,
            });
          } catch (err: any) {
            if (err.message === 'CANCELLED') {
              send('cancelled', { phase: 2, resumeFromPhase: 2, message: '⏸ Filtraggio interrotto. File filtrato parziale eliminato. Riprendi dalla Fase 2.' });
              return;
            }
            throw err;
          }
        } else {
          send('phase_start', { phase: 2, skipped: true, message: '⏭ Fase 2 saltata' });
          send('phase_done', { phase: 2, skipped: true, message: '⏭ Filtraggio saltato' });
        }

        if (isCancelled()) { send('cancelled', { resumeFromPhase: 2, message: '⏸ Pipeline interrotta.' }); return; }

        // ══ FASE 3: IMPORT DB ══════════════════════════════════════════════
        if (!fs.existsSync(filteredPath)) {
          throw new Error(`File filtrato non trovato: ${filteredPath}. Esegui prima il filtraggio.`);
        }

        send('phase_start', { phase: 3, message: `💾 Avvio import nel database (${filterStats.totalWritten > 0 ? filterStats.totalWritten.toLocaleString('it-IT') + ' prodotti stimati' : 'avvio...'})...` });
        try {
          await phase3Import(send, filteredPath, filterStats.totalWritten, ctx, isCancelled);
          send('phase_done', {
            phase: 3,
            totalImported: ctx.totalImported,
            totalErrors: ctx.totalErrors,
            message: `✅ Import completato: ${ctx.totalImported.toLocaleString('it-IT')} prodotti nel database`,
          });
          send('done', {
            totalImported: ctx.totalImported,
            totalErrors: ctx.totalErrors,
            filterStats,
            message: `🎉 Pipeline completata! ${ctx.totalImported.toLocaleString('it-IT')} prodotti gluten-free italiani importati nel database.`,
          });
        } catch (err: any) {
          if (err.message === 'CANCELLED_IMPORT') {
            send('cancelled', {
              phase: 3,
              resumeFromPhase: 3,
              totalImported: ctx.totalImported,
              message: `⏸ Import interrotto. ${ctx.totalImported.toLocaleString('it-IT')} prodotti già salvati. Riprendi dalla Fase 3 per continuare.`,
            });
            return;
          }
          throw err;
        }

      } catch (err: any) {
        console.error('[off-pipeline] Fatal error:', err);
        send('error', { message: err?.message || 'Errore sconosciuto' });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    }
  });
}
