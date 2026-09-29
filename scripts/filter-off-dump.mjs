#!/usr/bin/env node
/**
 * filter-off-dump.mjs
 *
 * Filtra il dump JSONL di OpenFoodFacts per estrarre solo i prodotti gluten-free italiani.
 * Uso: node scripts/filter-off-dump.mjs --input <path/openfoodfacts-products.jsonl.gz> --output <path/gluten-free-products.jsonl>
 *
 * Il file di input può essere .jsonl oppure .jsonl.gz (decompressione automatica).
 * Il file di output è sempre JSONL non compresso (un prodotto JSON per riga).
 *
 * Filtro applicato:
 *   - labels_tags contiene "en:gluten-free" O "en:no-gluten"
 *   - allergens_tags NON contiene "en:gluten"
 *   - countries_tags contiene "en:italy"
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Argomenti CLI ─────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { input: null, output: null, help: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' || args[i] === '-i') result.input = args[++i];
    else if (args[i] === '--output' || args[i] === '-o') result.output = args[++i];
    else if (args[i] === '--help' || args[i] === '-h') result.help = true;
  }
  return result;
}

function printHelp() {
  console.log(`
Uso: node scripts/filter-off-dump.mjs --input <file> --output <file>

Opzioni:
  --input,  -i   Percorso al dump OFF (openfoodfacts-products.jsonl o .jsonl.gz)
  --output, -o   Percorso output per il file filtrato (.jsonl)
  --help,   -h   Mostra questo messaggio

Esempio:
  node scripts/filter-off-dump.mjs \\
    --input C:/Downloads/off-data/openfoodfacts-products.jsonl.gz \\
    --output C:/Downloads/off-data/gluten-free-products.jsonl

Filtro applicato:
  - labels_tags include "en:gluten-free" O "en:no-gluten"
  - allergens_tags NON include "en:gluten"
  - countries_tags include "en:italy"
  `);
}

// ─── Logica di categorizzazione (replica di OpenFoodFactsProvider) ──────────

function getDynamicCategoryStyle(slug) {
  if (/carn|salum|prosciutt|mortadell|speck|wrustel|pollo|bovino|maiale/.test(slug)) return { emoji: '🥩', color: '#dc2626' };
  if (/pesc|tonn|salmon|merluzz|crostace|mollusc|gamber/.test(slug)) return { emoji: '🐟', color: '#0284c7' };
  if (/past|spaghett|maccheron|tortellin|raviol|gnocch|riso|cereali/.test(slug)) return { emoji: '🍝', color: '#ca8a04' };
  if (/pan|lievitat|focacc|grissin|cracker|piadin|panin|fette/.test(slug)) return { emoji: '🍞', color: '#d97706' };
  if (/verd|ortagg|insalat|pomodor|patat|legum|fagiol|lenticch|ceci/.test(slug)) return { emoji: '🥗', color: '#16a34a' };
  if (/frutt|mel|banan|agrum|succ|marmellat|confettur/.test(slug)) return { emoji: '🍎', color: '#ea580c' };
  if (/olio|condiment|sals|maiones|ket|senap|dad|spezie|brodo/.test(slug)) return { emoji: '🫒', color: '#65a30d' };
  if (/snack|patatin|popcorn|salat/.test(slug)) return { emoji: '🥨', color: '#b45309' };
  if (/bevand|acq|bibit|tè|caffè|infus|birr|vino/.test(slug)) return { emoji: '🥤', color: '#0891b2' };
  return { emoji: '🏷️', color: '#6366f1' };
}

function categorizeProduct(p) {
  const tagsArr = Array.isArray(p.categories_tags) ? p.categories_tags : [];
  const offTags = tagsArr.map(t => (typeof t === 'string' ? t.toLowerCase() : ''));
  const name = [p.product_name_it, p.product_name, p.brands].filter(Boolean).join(' ').toLowerCase();

  // LIVELLO 1: Tassonomia diretta
  if (offTags.some(t => t.includes('cheese') || t.includes('formagg') || t.includes('ricott') || t.includes('mozzarell') || t.includes('cream-cheeses')))
    return { id: 'formaggi', label: 'Formaggi & Spalmabili', emoji: '🧀', color: '#d97706' };
  if (offTags.some(t => t.includes('yogurt') || t.includes('plant-yogurt') || t.includes('fermented-milk') || t.includes('pudding')))
    return { id: 'yogurt-dessert', label: 'Yogurt & Dessert', emoji: '🫙', color: '#16a34a' };
  if (offTags.some(t => t.includes('plant-milk') || t.includes('plant-based-beverage') || t.includes('milk-substitute') || t.includes('soy-milk') || t.includes('oat-milk') || t.includes('almond-milk')))
    return { id: 'alternative-vegetali', label: 'Alternative Vegetali', emoji: '🥛', color: '#7c3aed' };
  if (offTags.some(t => t.includes('ice-cream') || t.includes('sorbet') || t.includes('gelat')))
    return { id: 'gelati', label: 'Gelati', emoji: '🍦', color: '#0891b2' };
  if (offTags.some(t => t.includes('biscuit') || t.includes('cookie') || t.includes('cake') || t.includes('pastries') || t.includes('sweet-snack') || t.includes('biscott')))
    return { id: 'dolci-biscotti', label: 'Dolci & Biscotti', emoji: '🍪', color: '#be185d' };
  if (offTags.some(t => t.includes('meat') || t.includes('cold-cut') || t.includes('ham') || t.includes('sausage') || t.includes('salum') || t.includes('affettat')))
    return { id: 'salumi-carni', label: 'Salumi & Carni', emoji: '🥓', color: '#dc2626' };
  if (offTags.some(t => t.includes('bread') || t.includes('flatbread') || t.includes('rusk') || t.includes('cracker') || t.includes('lievitat')))
    return { id: 'pane-lievitati', label: 'Pane & Lievitati', emoji: '🍞', color: '#d97706' };
  if (offTags.some(t => t.includes('pasta') || t.includes('cereal') || t.includes('rice') || t.includes('spaghetti')))
    return { id: 'pasta-cereali', label: 'Pasta & Cereali', emoji: '🍝', color: '#ca8a04' };
  if (offTags.some(t => t.includes('ready-meal') || t.includes('pizza') || t.includes('burger') || t.includes('piatt')))
    return { id: 'piatti-pronti', label: 'Piatti Pronti', emoji: '🍳', color: '#b45309' };
  if (offTags.some(t => t.includes('condiment') || t.includes('sauce') || t.includes('oil') || t.includes('mayonnaise')))
    return { id: 'condimenti-salse', label: 'Condimenti & Salse', emoji: '🫒', color: '#65a30d' };

  // LIVELLO 2: Scoring matrix (semplificata)
  const fullText = [name, offTags.join(' ')].join(' ');
  const scores = {
    'formaggi': 0, 'yogurt-dessert': 0, 'alternative-vegetali': 0, 'gelati': 0,
    'dolci-biscotti': 0, 'salumi-carni': 0, 'pane-lievitati': 0, 'pasta-cereali': 0,
    'piatti-pronti': 0, 'condimenti-salse': 0, 'bevande': 0,
  };
  if (/formaggio|cheese|mozzarell|burr|ricott|stracchino|mascarpone|provola/i.test(fullText)) scores['formaggi'] += 8;
  if (/yogurt|kefir|bifidus|budino|dessert|pudding|mousse/i.test(fullText)) scores['yogurt-dessert'] += 8;
  if (/bevanda.*soia|bevanda.*riso|bevanda.*avena|latte.*soia|latte.*riso|oat drink|soya/i.test(fullText)) scores['alternative-vegetali'] += 8;
  if (/gelato|ice cream|sorbetto|magnum|cucciolone|stecco/i.test(fullText)) scores['gelati'] += 8;
  if (/biscott|frollin|cookie|biscuit|wafer|cake|torta|muffin|crostata|cioccolat/i.test(fullText)) scores['dolci-biscotti'] += 8;
  if (/prosciutt|salum|mortadell|pancett|speck|wurstel|carn|bresaol|affettat|bacon/i.test(fullText)) scores['salumi-carni'] += 8;
  if (/pane|panino|grissin|cracker|piadin|focacc|lievitat|tarall|toast/i.test(fullText)) scores['pane-lievitati'] += 8;
  if (/past|spaghett|penn|fusill|gnocch|riso|farro|granola|muesli|cereali/i.test(fullText)) scores['pasta-cereali'] += 8;
  if (/burger|pizza|lasagna|zuppa|soup|cotoletta|nugget|risotto/i.test(fullText)) scores['piatti-pronti'] += 8;
  if (/olio|aceto|sals|maiones|pesto|spezie|condiment|brodo/i.test(fullText)) scores['condimenti-salse'] += 8;
  if (/acq|bibit|succ|thè|tè|caffè|birr|vino|bevanda|tisana/i.test(fullText)) scores['bevande'] += 8;

  const categoryMap = {
    'formaggi': { label: 'Formaggi & Spalmabili', emoji: '🧀', color: '#d97706' },
    'yogurt-dessert': { label: 'Yogurt & Dessert', emoji: '🫙', color: '#16a34a' },
    'alternative-vegetali': { label: 'Alternative Vegetali', emoji: '🥛', color: '#7c3aed' },
    'gelati': { label: 'Gelati', emoji: '🍦', color: '#0891b2' },
    'dolci-biscotti': { label: 'Dolci & Biscotti', emoji: '🍪', color: '#be185d' },
    'salumi-carni': { label: 'Salumi & Carni', emoji: '🥓', color: '#dc2626' },
    'pane-lievitati': { label: 'Pane & Lievitati', emoji: '🍞', color: '#d97706' },
    'pasta-cereali': { label: 'Pasta & Cereali', emoji: '🍝', color: '#ca8a04' },
    'piatti-pronti': { label: 'Piatti Pronti', emoji: '🍳', color: '#b45309' },
    'condimenti-salse': { label: 'Condimenti & Salse', emoji: '🫒', color: '#65a30d' },
    'bevande': { label: 'Bevande', emoji: '🥤', color: '#0891b2' },
  };

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (best[1] >= 5) {
    return { id: best[0], ...categoryMap[best[0]] };
  }

  // LIVELLO 3: fallback da categories field
  if (p.categories) {
    const parts = p.categories.split(',').map(s => s.trim()).filter(Boolean);
    const genericWords = ['plant-based', 'alimenti', 'cibi', 'beverages', 'foods', 'prodotti', 'en:'];
    const candidate = parts.find(part => part.length <= 30 && !genericWords.some(w => part.toLowerCase().includes(w))) || parts[0];
    if (candidate) {
      const id = candidate.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (id && id.length > 1) {
        const label = candidate.charAt(0).toUpperCase() + candidate.slice(1);
        const style = getDynamicCategoryStyle(id);
        return { id, label, emoji: style.emoji, color: style.color };
      }
    }
  }

  return { id: 'personalizzato', label: 'Personalizzato', emoji: '⭐', color: '#f59e0b' };
}

// ─── Filtro gluten-free ────────────────────────────────────────────────────

function isGlutenFreeItalian(product) {
  const labels = Array.isArray(product.labels_tags) ? product.labels_tags : [];
  const allergens = Array.isArray(product.allergens_tags) ? product.allergens_tags : [];
  const countries = Array.isArray(product.countries_tags) ? product.countries_tags : [];

  const hasGlutenFreeLabel = labels.includes('en:gluten-free') || labels.includes('en:no-gluten');
  const hasGlutenAllergen = allergens.includes('en:gluten');
  const isItalian = countries.includes('en:italy');

  return hasGlutenFreeLabel && !hasGlutenAllergen && isItalian;
}

// ─── Mapping al formato DB ─────────────────────────────────────────────────

function mapProduct(p) {
  const labels = Array.isArray(p.labels_tags) ? p.labels_tags : [];
  const allergens = Array.isArray(p.allergens_tags) ? p.allergens_tags : [];
  const hasGluten = allergens.includes('en:gluten');
  const isGlutenFree = labels.includes('en:gluten-free') || labels.includes('en:no-gluten');

  const name = p.product_name_it || p.product_name || p.brands || 'Prodotto Sconosciuto';
  const description = p.ingredients_text_it || p.ingredients_text || '';
  const catInfo = categorizeProduct(p);

  return {
    id: p.code,
    name_enc: name,
    description_enc: description,
    category: catInfo.id,
    categoryLabel: catInfo.label,
    categoryColor: catInfo.color,
    emoji: catInfo.emoji,
    tags: labels,
    is_gluten_free: isGlutenFree || !hasGluten,
    gluten_level: (isGlutenFree || !hasGluten) ? 'none' : 'trace',
    off_image_url: p.image_url || p.image_front_small_url || null,
    nutriscore: p.nutriscore_grade ? p.nutriscore_grade.toLowerCase() : null,
    nova_group: p.nova_group || null,
    ecoscore: p.ecoscore_grade ? p.ecoscore_grade.toLowerCase() : null,
    allergens: allergens,
    ingredients_text: description || null,
    brand: p.brands || null,
    quantity: p.quantity || null,
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  if (args.help || !args.input || !args.output) {
    printHelp();
    if (!args.help) {
      console.error('\n❌ Errore: specificare --input e --output\n');
      process.exit(1);
    }
    return;
  }

  const inputPath = path.resolve(args.input);
  const outputPath = path.resolve(args.output);

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ File di input non trovato: ${inputPath}`);
    process.exit(1);
  }

  console.log(`\n🔍 Input:  ${inputPath}`);
  console.log(`📝 Output: ${outputPath}`);
  console.log(`\nFiltro: labels_tags ⊇ (en:gluten-free OR en:no-gluten) AND allergens_tags ⊄ en:gluten AND countries_tags ⊇ en:italy\n`);

  const inputStat = fs.statSync(inputPath);
  const isGz = inputPath.endsWith('.gz');
  
  // Crea stream di lettura
  const fileStream = fs.createReadStream(inputPath);
  const decompressStream = isGz ? zlib.createGunzip() : fileStream;
  const inputStream = isGz ? fileStream.pipe(decompressStream) : fileStream;

  const rl = readline.createInterface({ input: inputStream, crlfDelay: Infinity });
  const outputStream = fs.createWriteStream(outputPath, { encoding: 'utf8' });

  let totalRead = 0;
  let totalFiltered = 0;
  let totalWritten = 0;
  let errors = 0;
  const startTime = Date.now();

  let lastLog = Date.now();

  for await (const line of rl) {
    if (!line.trim()) continue;
    totalRead++;

    try {
      const product = JSON.parse(line);
      if (isGlutenFreeItalian(product)) {
        totalFiltered++;
        const mapped = mapProduct(product);
        // Salta prodotti senza ID o nome valido
        if (!mapped.id || !mapped.name_enc || mapped.name_enc === 'Prodotto Sconosciuto') continue;
        outputStream.write(JSON.stringify(mapped) + '\n');
        totalWritten++;
      }
    } catch {
      errors++;
    }

    // Log progresso ogni 5 secondi
    if (Date.now() - lastLog > 5000) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = Math.round(totalRead / ((Date.now() - startTime) / 1000));
      console.log(`  Lette ${totalRead.toLocaleString()} righe | Trovati ${totalFiltered} gluten-free | ${rate} rig/s | ${elapsed}s`);
      lastLog = Date.now();
    }
  }

  outputStream.end();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n✅ Completato in ${elapsed}s`);
  console.log(`   Righe lette:      ${totalRead.toLocaleString()}`);
  console.log(`   Prodotti trovati: ${totalFiltered.toLocaleString()}`);
  console.log(`   Prodotti scritti: ${totalWritten.toLocaleString()}`);
  console.log(`   Errori di parse:  ${errors.toLocaleString()}`);
  console.log(`   Output: ${outputPath}\n`);
}

main().catch(err => {
  console.error('❌ Errore fatale:', err.message);
  process.exit(1);
});
