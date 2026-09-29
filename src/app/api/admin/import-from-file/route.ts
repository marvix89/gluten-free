import { auth } from '@/lib/auth';
import { ensureSchema, getDb } from '@/lib/db';
import fs from 'fs';
import path from 'path';
import zlib, { createGunzip } from 'zlib';
import readline from 'readline';

// ─── Filtro gluten-free (stesso usato dallo script offline) ────────────────

function isGlutenFreeItalian(product: any): boolean {
  const labels: string[] = Array.isArray(product.labels_tags) ? product.labels_tags : [];
  const allergens: string[] = Array.isArray(product.allergens_tags) ? product.allergens_tags : [];
  const countries: string[] = Array.isArray(product.countries_tags) ? product.countries_tags : [];

  const hasGlutenFreeLabel = labels.includes('en:gluten-free') || labels.includes('en:no-gluten');
  const hasGlutenAllergen = allergens.includes('en:gluten');
  const isItalian = countries.includes('en:italy');

  return hasGlutenFreeLabel && !hasGlutenAllergen && isItalian;
}

// ─── Logica di categorizzazione (condivisa con il provider OFF) ────────────

function getDynamicCategoryStyle(slug: string): { emoji: string; color: string } {
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

function categorizeProduct(p: any): { id: string; label: string; emoji: string; color: string } {
  const tagsArr = Array.isArray(p.categories_tags) ? p.categories_tags : [];
  const offTags = tagsArr.map((t: string) => (typeof t === 'string' ? t.toLowerCase() : ''));
  const name = [p.product_name_it, p.product_name, p.brands].filter(Boolean).join(' ').toLowerCase();

  if (offTags.some((t: string) => t.includes('cheese') || t.includes('formagg') || t.includes('ricott') || t.includes('mozzarell') || t.includes('cream-cheeses')))
    return { id: 'formaggi', label: 'Formaggi & Spalmabili', emoji: '🧀', color: '#d97706' };
  if (offTags.some((t: string) => t.includes('yogurt') || t.includes('plant-yogurt') || t.includes('fermented-milk') || t.includes('pudding')))
    return { id: 'yogurt-dessert', label: 'Yogurt & Dessert', emoji: '🫙', color: '#16a34a' };
  if (offTags.some((t: string) => t.includes('plant-milk') || t.includes('plant-based-beverage') || t.includes('milk-substitute') || t.includes('soy-milk') || t.includes('oat-milk') || t.includes('almond-milk')))
    return { id: 'alternative-vegetali', label: 'Alternative Vegetali', emoji: '🥛', color: '#7c3aed' };
  if (offTags.some((t: string) => t.includes('ice-cream') || t.includes('sorbet') || t.includes('gelat')))
    return { id: 'gelati', label: 'Gelati', emoji: '🍦', color: '#0891b2' };
  if (offTags.some((t: string) => t.includes('biscuit') || t.includes('cookie') || t.includes('cake') || t.includes('pastries') || t.includes('sweet-snack') || t.includes('biscott')))
    return { id: 'dolci-biscotti', label: 'Dolci & Biscotti', emoji: '🍪', color: '#be185d' };
  if (offTags.some((t: string) => t.includes('meat') || t.includes('cold-cut') || t.includes('ham') || t.includes('sausage') || t.includes('salum') || t.includes('affettat')))
    return { id: 'salumi-carni', label: 'Salumi & Carni', emoji: '🥓', color: '#dc2626' };
  if (offTags.some((t: string) => t.includes('bread') || t.includes('flatbread') || t.includes('rusk') || t.includes('cracker') || t.includes('lievitat')))
    return { id: 'pane-lievitati', label: 'Pane & Lievitati', emoji: '🍞', color: '#d97706' };
  if (offTags.some((t: string) => t.includes('pasta') || t.includes('cereal') || t.includes('rice') || t.includes('spaghetti')))
    return { id: 'pasta-cereali', label: 'Pasta & Cereali', emoji: '🍝', color: '#ca8a04' };
  if (offTags.some((t: string) => t.includes('ready-meal') || t.includes('pizza') || t.includes('burger') || t.includes('piatt')))
    return { id: 'piatti-pronti', label: 'Piatti Pronti', emoji: '🍳', color: '#b45309' };
  if (offTags.some((t: string) => t.includes('condiment') || t.includes('sauce') || t.includes('oil') || t.includes('mayonnaise')))
    return { id: 'condimenti-salse', label: 'Condimenti & Salse', emoji: '🫒', color: '#65a30d' };

  // Scoring matrix
  const fullText = [name, offTags.join(' ')].join(' ');
  const scores: Record<string, number> = {
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

  const categoryMeta: Record<string, { label: string; emoji: string; color: string }> = {
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
    return { id: best[0], ...categoryMeta[best[0]] };
  }

  // Fallback da categories field
  if (p.categories) {
    const parts = p.categories.split(',').map((s: string) => s.trim()).filter(Boolean);
    const genericWords = ['plant-based', 'alimenti', 'cibi', 'beverages', 'foods', 'prodotti', 'en:'];
    const candidate = parts.find((part: string) => part.length <= 30 && !genericWords.some((w: string) => part.toLowerCase().includes(w))) || parts[0];
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

// ─── Mapping prodotto al formato DB ────────────────────────────────────────

function mapToDbRow(p: any) {
  const labels: string[] = Array.isArray(p.labels_tags) ? p.labels_tags : [];
  const allergens: string[] = Array.isArray(p.allergens_tags) ? p.allergens_tags : [];

  const hasGluten = allergens.includes('en:gluten');
  const isGlutenFree = labels.includes('en:gluten-free') || labels.includes('en:no-gluten');

  // Se il file è già pre-processato dallo script, usa i campi mappati direttamente
  if (p.name_enc !== undefined) {
    return {
      id: p.id,
      name_enc: p.name_enc,
      description_enc: p.description_enc || '',
      category: p.category,
      emoji: p.emoji,
      tags: p.tags || [],
      gluten_level: p.gluten_level || 'none',
      is_gluten_free: p.is_gluten_free !== undefined ? p.is_gluten_free : true,
      off_image_url: p.off_image_url || null,
      nutriscore: p.nutriscore || null,
      nova_group: p.nova_group || null,
      ecoscore: p.ecoscore || null,
      allergens: p.allergens || [],
      ingredients_text: p.ingredients_text || null,
      brand: p.brand || null,
      quantity: p.quantity || null,
      categoryLabel: p.categoryLabel,
      categoryColor: p.categoryColor,
    };
  }

  // Altrimenti è il dump grezzo OFF — mappa al volo
  const name = p.product_name_it || p.product_name || p.brands || 'Prodotto Sconosciuto';
  const description = p.ingredients_text_it || p.ingredients_text || '';
  const catInfo = categorizeProduct(p);

  return {
    id: p.code,
    name_enc: name,
    description_enc: description,
    category: catInfo.id,
    emoji: catInfo.emoji,
    tags: labels,
    gluten_level: (isGlutenFree || !hasGluten) ? 'none' : 'trace',
    is_gluten_free: isGlutenFree || !hasGluten,
    off_image_url: p.image_url || p.image_front_small_url || null,
    nutriscore: p.nutriscore_grade ? p.nutriscore_grade.toLowerCase() : null,
    nova_group: p.nova_group || null,
    ecoscore: p.ecoscore_grade ? p.ecoscore_grade.toLowerCase() : null,
    allergens,
    ingredients_text: description || null,
    brand: p.brands || null,
    quantity: p.quantity || null,
    categoryLabel: catInfo.label,
    categoryColor: catInfo.color,
  };
}

const BATCH_SIZE = 500;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return Response.json({ error: 'Accesso negato' }, { status: 403 });
  }

  let filePath: string;
  let isRawDump: boolean;
  try {
    const body = await request.json();
    filePath = body.filePath?.trim();
    // Se true, il file è il dump grezzo OFF (applica il filtro). Se false, è già pre-filtrato.
    isRawDump = body.isRawDump === true;
    if (!filePath) throw new Error('filePath mancante');
  } catch {
    return Response.json({ error: 'Body non valido: specificare filePath' }, { status: 400 });
  }

  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    return Response.json({ error: `File non trovato: ${resolvedPath}` }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: object) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { /* controller già chiuso */ }
      };

      try {
        await ensureSchema();
        const sql = getDb();

        const isGz = resolvedPath.endsWith('.gz');
        const fileStream = fs.createReadStream(resolvedPath);
        const inputStream = isGz
          ? fileStream.pipe(createGunzip())
          : fileStream;

        const rl = readline.createInterface({ input: inputStream, crlfDelay: Infinity });

        let totalRead = 0;
        let totalImported = 0;
        let totalSkipped = 0;
        let totalErrors = 0;
        let batch: ReturnType<typeof mapToDbRow>[] = [];
        let categoriesSeenThisSession = new Set<string>();

        send('progress', {
          type: 'start',
          message: `🚀 Avvio import da ${path.basename(resolvedPath)}...`,
        });

        const flushBatch = async (currentBatch: ReturnType<typeof mapToDbRow>[]) => {
          if (currentBatch.length === 0) return;

          // Upsert categorie (solo quelle nuove in questa sessione)
          const uniqueCats = new Map<string, { id: string; label: string; emoji: string; color: string }>();
          for (const r of currentBatch) {
            if (!categoriesSeenThisSession.has(r.category)) {
              uniqueCats.set(r.category, { id: r.category, label: r.categoryLabel || r.category, emoji: r.emoji, color: r.categoryColor || '#6366f1' });
              categoriesSeenThisSession.add(r.category);
            }
          }

          const catQueries = Array.from(uniqueCats.values()).map(c => sql`
            INSERT INTO categories (id, label, emoji, color)
            VALUES (${c.id}, ${c.label}, ${c.emoji}, ${c.color})
            ON CONFLICT (id) DO NOTHING
          `);

          // Upsert prodotti
          const productQueries = currentBatch.map(r => sql`
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
          totalImported += currentBatch.length;
        };

        for await (const line of rl) {
          if (!line.trim()) continue;
          totalRead++;

          try {
            const product = JSON.parse(line);

            // Se è il dump grezzo, applica il filtro gluten-free+italia
            if (isRawDump && !isGlutenFreeItalian(product)) {
              totalSkipped++;
              continue;
            }

            const row = mapToDbRow(product);

            // Salta prodotti senza ID o nome
            if (!row.id || !row.name_enc || row.name_enc === 'Prodotto Sconosciuto') {
              totalSkipped++;
              continue;
            }

            batch.push(row);

            if (batch.length >= BATCH_SIZE) {
              await flushBatch(batch);
              batch = [];
              send('progress', {
                type: 'batch_done',
                totalRead,
                totalImported,
                totalSkipped,
                message: `📦 Lette ${totalRead.toLocaleString()} righe | ${totalImported.toLocaleString()} importati | ${totalSkipped.toLocaleString()} saltati`,
              });
            }
          } catch {
            totalErrors++;
          }
        }

        // Flush ultimo batch
        if (batch.length > 0) {
          await flushBatch(batch);
          batch = [];
        }

        send('done', {
          totalRead,
          totalImported,
          totalSkipped,
          totalErrors,
          message: `✅ Import completato!\n📊 Lette: ${totalRead.toLocaleString()} righe\n✅ Importati: ${totalImported.toLocaleString()} prodotti\n⏭ Saltati: ${totalSkipped.toLocaleString()}\n❌ Errori parse: ${totalErrors}`,
        });

      } catch (err: any) {
        console.error('[import-from-file] Fatal error:', err);
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
