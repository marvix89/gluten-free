#!/usr/bin/env node
/**
 * sync-cloudinary-images.mjs
 *
 * Upload massivo immagini su Cloudinary per tutti i prodotti del catalogo.
 *
 * Strategia:
 *   1. Prodotti con off_image_url gia' nel DB → upload diretto.
 *   2. Prodotti senza off_image_url → costruiamo URL candidati dal barcode
 *      (pattern OFF prevedibile) e li passiamo direttamente a Cloudinary
 *      senza HEAD check. Se Cloudinary non riesce a scaricarli, catturiamo
 *      l'errore e marchiamo 'none'. Veloce: niente round-trip extra.
 *
 * Uso:
 *   node scripts/sync-cloudinary-images.mjs [opzioni]
 *
 * Opzioni:
 *   --concurrency N   Upload paralleli (default: 15)
 *   --batch N         Prodotti per ciclo DB (default: 300)
 *   --skip-no-url     Salta prodotti senza off_image_url
 *   --dry-run         Simula senza caricare
 *   --help, -h        Questo messaggio
 *
 * Riprendibile: i prodotti gia' con cloudinary_public_id sono saltati.
 */

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { neon } = require('@neondatabase/serverless');
const { v2: cloudinary } = require('cloudinary');

// ─── Args ────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const r = { concurrency: 15, batch: 300, skipNoUrl: false, dryRun: false, help: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--concurrency' || args[i] === '-c') r.concurrency = parseInt(args[++i], 10);
    else if (args[i] === '--batch' || args[i] === '-b') r.batch = parseInt(args[++i], 10);
    else if (args[i] === '--skip-no-url') r.skipNoUrl = true;
    else if (args[i] === '--dry-run') r.dryRun = true;
    else if (args[i] === '--help' || args[i] === '-h') r.help = true;
  }
  return r;
}

function printHelp() {
  console.log(`
Uso: node scripts/sync-cloudinary-images.mjs [opzioni]

Opzioni:
  --concurrency N   Upload Cloudinary paralleli (default: 15)
  --batch N         Prodotti per ciclo DB (default: 300)
  --skip-no-url     Salta prodotti senza off_image_url
  --dry-run         Simula senza caricare
  --help, -h        Questo messaggio

Esempi:
  node scripts/sync-cloudinary-images.mjs
  node scripts/sync-cloudinary-images.mjs --concurrency 10
  node scripts/sync-cloudinary-images.mjs --skip-no-url --concurrency 20
  node scripts/sync-cloudinary-images.mjs --dry-run
`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = n => n.toLocaleString('it-IT');

function fmtTime(sec) {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  if (m < 60) return `${m}m ${s}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function clearLine() {
  if (process.stdout.isTTY) { process.stdout.clearLine(0); process.stdout.cursorTo(0); }
}

function printProgress({ done, total, succeeded, failed, skipped, startTime }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const elapsed = (Date.now() - startTime) / 1000;
  const rate = elapsed > 10 ? (succeeded / elapsed) * 60 : 0;
  const eta = rate > 0 ? ((total - done) / rate) * 60 : 0;
  const w = 20, f = Math.round(pct / 5);
  const bar = '\u2588'.repeat(f) + '\u2591'.repeat(w - f);
  clearLine();
  process.stdout.write(
    `[${bar}] ${String(pct).padStart(3)}%  \u2705${fmt(succeeded)} \u274C${fmt(failed)} \u23ED${fmt(skipped)}  ` +
    `\u26A1${Math.round(rate)}/min  ETA:${fmtTime(eta)}  (${fmt(done)}/${fmt(total)})`
  );
}

// ─── Costruzione URL OFF da barcode ──────────────────────────────────────────
//
// OFF salva le immagini in:
//   https://images.openfoodfacts.org/images/products/{path}/{type}.{rev}.{size}.jpg
// dove:
//   path  = barcode diviso in gruppi 3/3/3/resto  (es. 800/150/500/5592)
//   type  = front_it, front_fr, front_en, front
//   rev   = numero revisione (1-6, non prevedibile → proviamo in ordine)
//   size  = 400 (thumbnail decente)
//
// Restituiamo una lista ordinata per probabilita' di successo.

function buildOffCandidateUrls(barcode) {
  const clean = String(barcode).replace(/\D/g, '');
  let bpath;
  if (clean.length <= 8) {
    bpath = clean;
  } else {
    bpath = `${clean.slice(0,3)}/${clean.slice(3,6)}/${clean.slice(6,9)}/${clean.slice(9)}`;
  }
  const base = `https://images.openfoodfacts.org/images/products/${bpath}`;
  const urls = [];
  for (const lang of ['it', 'fr', 'en']) {
    for (const rev of [3, 1, 2, 4, 5]) {
      urls.push(`${base}/front_${lang}.${rev}.400.jpg`);
    }
  }
  for (const rev of [3, 1, 2, 4, 5]) urls.push(`${base}/front.${rev}.400.jpg`);
  return urls;
}

// ─── Upload su Cloudinary (con retry su URL candidati) ───────────────────────

async function uploadProduct(sourceUrls, productId, dryRun) {
  const publicId = `gluten-free/products/${productId}`;
  if (dryRun) { await new Promise(r => setTimeout(r, 20)); return { publicId, tried: 1 }; }

  const candidates = Array.isArray(sourceUrls) ? sourceUrls : [sourceUrls];
  let lastErr = null;

  for (const url of candidates) {
    try {
      const result = await cloudinary.uploader.upload(url, {
        public_id: publicId, overwrite: false,
        quality: 'auto', fetch_format: 'auto', timeout: 25000,
      });
      return { publicId: result.public_id, tried: candidates.indexOf(url) + 1 };
    } catch (err) {
      const msg = err?.message || err?.error?.message || '';
      const code = err?.http_code || err?.error?.http_code;
      // Gia' presente: successo
      if (msg.includes('already exists') || code === 400) return { publicId, tried: 0 };
      // Rate limit: non proviamo altri URL, rilancia per gestione esterna
      if (code === 429 || msg.includes('429') || msg.includes('Rate limit')) throw err;
      // Errore download (immagine non trovata): proviamo il prossimo URL
      lastErr = err;
    }
  }
  // Tutti i candidati falliti
  throw lastErr || new Error('Nessun URL valido trovato');
}

// ─── Concurrency pool ─────────────────────────────────────────────────────────

async function pool(items, concurrency, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try { results[i] = await fn(items[i]); }
      catch (e) { results[i] = { __error: e?.message || String(e), __code: e?.http_code || e?.error?.http_code }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  if (args.help) { printHelp(); return; }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error('\u274C DATABASE_URL non trovata in .env.local'); process.exit(1); }

  // Config Cloudinary
  const cn = process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const ck = process.env.CLOUDINARY_API_KEY;
  const cs = process.env.CLOUDINARY_API_SECRET;
  if (process.env.CLOUDINARY_URL && (!cn || !ck || !cs)) {
    try {
      const clean = process.env.CLOUDINARY_URL.replace(/^cloudinary:\/\//, '');
      const [auth, host] = clean.split('@');
      if (host && auth?.includes(':')) { const [k,s]=auth.split(':'); cloudinary.config({ cloud_name: host, api_key: k, api_secret: s, secure: true }); }
    } catch { /* ignora */ }
  } else if (cn && ck && cs) {
    cloudinary.config({ cloud_name: cn, api_key: ck, api_secret: cs, secure: true });
  }
  if (!args.dryRun) {
    const cfg = cloudinary.config();
    if (!cfg.cloud_name || !cfg.api_key || !cfg.api_secret) {
      console.error('\u274C Credenziali Cloudinary mancanti in .env.local'); process.exit(1);
    }
  }

  const sql = neon(dbUrl);

  console.log('\n\uD83D\uDE80 Sync immagini su Cloudinary');
  console.log('\u2500'.repeat(58));
  console.log(`  Concurrency   : ${args.concurrency} upload paralleli`);
  console.log(`  Batch DB      : ${args.batch} prodotti per ciclo`);
  console.log(`  Senza URL     : ${args.skipNoUrl ? 'SALTATI' : 'Gestiti via pattern barcode'}`);
  if (args.dryRun) console.log('  Modalita\u0027      : \uD83E\uDDEA DRY RUN (nessun upload reale)');
  console.log('\u2500'.repeat(58));

  // Statistiche iniziali
  const [[r1],[r2],[r3]] = await Promise.all([
    sql`SELECT count(*)::int AS n FROM products WHERE is_custom=false AND off_image_url IS NOT NULL AND off_image_url!='' AND (cloudinary_public_id IS NULL OR cloudinary_public_id='')`,
    sql`SELECT count(*)::int AS n FROM products WHERE is_custom=false AND cloudinary_public_id IS NOT NULL AND cloudinary_public_id!='' AND cloudinary_public_id!='none'`,
    sql`SELECT count(*)::int AS n FROM products WHERE is_custom=false AND (off_image_url IS NULL OR off_image_url='') AND (cloudinary_public_id IS NULL OR cloudinary_public_id='')`,
  ]);

  const nWithUrl  = r1?.n ?? 0;
  const nDone     = r2?.n ?? 0;
  const nNoUrl    = r3?.n ?? 0;
  const total     = nWithUrl + (args.skipNoUrl ? 0 : nNoUrl);

  console.log(`\n\uD83D\uDCCA Stato attuale:`);
  console.log(`   \u2705 Gia\u0027 su Cloudinary          : ${fmt(nDone)}`);
  console.log(`   \uD83D\uDD04 Con off_image_url           : ${fmt(nWithUrl)}`);
  console.log(`   \uD83D\uDD0D Senza URL (da barcode)      : ${fmt(nNoUrl)}${args.skipNoUrl?' [SALTATI]':''}`);
  console.log(`   \uD83C\uDFAF Totale da processare        : ${fmt(total)}`);
  console.log('');

  if (total === 0) { console.log('\uD83C\uDF89 Tutto gi\u00E0 sincronizzato!\n'); return; }

  let totalDone=0, totalSucceeded=0, totalFailed=0, totalSkipped=0;
  const startTime = Date.now();

  // ─── Processa un batch di righe DB ────────────────────────────────────────
  async function processBatch(rows, getUrls) {
    await pool(rows, args.concurrency, async (row) => {
      const urls = getUrls(row);
      if (!urls || (Array.isArray(urls) && urls.length === 0)) {
        // Nessun URL possibile
        if (!args.dryRun) await sql`UPDATE products SET cloudinary_public_id='none' WHERE id=${row.id}`.catch(()=>{});
        totalSkipped++; totalDone++;
        printProgress({ done: totalDone, total, succeeded: totalSucceeded, failed: totalFailed, skipped: totalSkipped, startTime });
        return;
      }
      try {
        const { publicId } = await uploadProduct(urls, row.id, args.dryRun);
        if (!args.dryRun) {
          // Salva anche off_image_url se non era presente
          const firstUrl = Array.isArray(urls) ? urls[0] : urls;
          if (row.off_image_url) {
            await sql`UPDATE products SET cloudinary_public_id=${publicId} WHERE id=${row.id}`;
          } else {
            await sql`UPDATE products SET cloudinary_public_id=${publicId}, off_image_url=${firstUrl} WHERE id=${row.id}`;
          }
        }
        totalSucceeded++;
      } catch (err) {
        const msg = err?.message || String(err);
        const code = err?.http_code || err?.error?.http_code;
        const isRL = code===429 || msg.includes('429') || msg.includes('Rate limit');
        if (!isRL && !args.dryRun) {
          await sql`UPDATE products SET cloudinary_public_id='none' WHERE id=${row.id}`.catch(()=>{});
        }
        totalFailed++;
      } finally {
        totalDone++;
        printProgress({ done: totalDone, total, succeeded: totalSucceeded, failed: totalFailed, skipped: totalSkipped, startTime });
      }
    });
  }

  // ─── FASE 1: prodotti CON off_image_url ───────────────────────────────────
  if (nWithUrl > 0) {
    console.log(`\u26A1 FASE 1: ${fmt(nWithUrl)} prodotti con URL gia\u0027 presenti...\n`);
    let hasMore = true;
    while (hasMore) {
      const rows = await sql`
        SELECT id, off_image_url FROM products
        WHERE is_custom=false AND off_image_url IS NOT NULL AND off_image_url!=''
          AND (cloudinary_public_id IS NULL OR cloudinary_public_id='')
        ORDER BY id LIMIT ${args.batch}`;
      if (!rows.length) break;
      await processBatch(rows, row => row.off_image_url);
      if (rows.length < args.batch) hasMore = false;
      if (hasMore) await new Promise(r => setTimeout(r, 100));
    }
    console.log('\n');
  }

  // ─── FASE 2: prodotti SENZA off_image_url ────────────────────────────────
  if (!args.skipNoUrl && nNoUrl > 0) {
    console.log(`\uD83D\uDD0D FASE 2: ${fmt(nNoUrl)} prodotti senza URL → pattern da barcode...\n`);
    let hasMore = true;
    while (hasMore) {
      const rows = await sql`
        SELECT id FROM products
        WHERE is_custom=false AND (off_image_url IS NULL OR off_image_url='')
          AND (cloudinary_public_id IS NULL OR cloudinary_public_id='')
        ORDER BY id LIMIT ${args.batch}`;
      if (!rows.length) break;
      await processBatch(rows, row => buildOffCandidateUrls(row.id));
      if (rows.length < args.batch) hasMore = false;
      if (hasMore) await new Promise(r => setTimeout(r, 100));
    }
    console.log('\n');
  }

  // ─── Report finale ─────────────────────────────────────────────────────────
  const elapsed = (Date.now() - startTime) / 1000;
  console.log('\u2500'.repeat(58));
  console.log('\u2705 Sync completato!');
  console.log('\u2500'.repeat(58));
  console.log(`   Caricati con successo    : ${fmt(totalSucceeded)}`);
  console.log(`   Senza immagine (none)    : ${fmt(totalSkipped)}`);
  console.log(`   Errori                   : ${fmt(totalFailed)}`);
  console.log(`   Tempo totale             : ${fmtTime(elapsed)}`);
  console.log(`   Velocita\u0027 media           : ${Math.round((totalSucceeded / Math.max(elapsed,1)) * 60)} upload/min`);

  const [fs] = await sql`
    SELECT
      count(*) FILTER (WHERE is_custom=false)::int AS total,
      count(*) FILTER (WHERE is_custom=false AND cloudinary_public_id IS NOT NULL AND cloudinary_public_id!='' AND cloudinary_public_id!='none')::int AS with_img,
      count(*) FILTER (WHERE is_custom=false AND (cloudinary_public_id IS NULL OR cloudinary_public_id=''))::int AS still_pending
    FROM products`;

  console.log('\n\uD83D\uDCCA Stato finale DB:');
  console.log(`   Prodotti pubblici        : ${fmt(fs?.total??0)}`);
  console.log(`   Con immagine Cloudinary  : ${fmt(fs?.with_img??0)}`);
  console.log(`   Ancora in attesa         : ${fmt(fs?.still_pending??0)}`);
  if ((fs?.still_pending??0) > 0) console.log('\n\uD83D\uDCA1 Rilancia per riprendere i rimanenti.');
  console.log('');
}

main().catch(e => { console.error('\n\u274C Errore fatale:', e.message||e); process.exit(1); });
