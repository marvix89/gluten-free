import { auth } from '@/lib/auth';
import { ensureSchema, getDb } from '@/lib/db';
import { OpenFoodFactsProvider } from '@/lib/product-enrichment/providers/open-food-facts';

// Questo endpoint gestisce l'intero loop di paginazione lato server,
// trasmettendo gli aggiornamenti di progresso via Server-Sent Events (SSE).
// In questo modo il browser fa UNA SOLA connessione e il server gestisce
// i delay tra le chiamate a OpenFoodFacts per evitare il rate-limit.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return Response.json({ error: 'Accesso negato' }, { status: 403 });
  }

  const body = await request.json();
  const q: string = body.q || '';
  const pageSize: number = parseInt(body.pageSize || '100', 10);
  // Safety ceiling in caso di dati anomali dall'API (es. pageCount infinito)
  const MAX_SAFETY_PAGES = 9999;
  // Delay base + jitter casuale per evitare pattern di rate-limit riconoscibili
  const BASE_DELAY_MS = 4000;
  const JITTER_MS = 2000; // ±2s di variazione casuale
  const randomDelay = () => BASE_DELAY_MS + Math.floor(Math.random() * JITTER_MS);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: object) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // controller gia chiuso
        }
      };

      try {
        await ensureSchema();
        const sql = getDb();
        const provider = new OpenFoodFactsProvider();

        let totalImported = 0;
        // totalPages viene impostato dinamicamente dalla prima risposta dell'API
        let totalPages = MAX_SAFETY_PAGES;

        for (let page = 1; page <= totalPages; page++) {
          // Delay tra le pagine (non sulla prima)
          if (page > 1) {
            const delay = randomDelay();
            send('progress', { type: 'delay', page, message: `⏱ Attendo ${(delay / 1000).toFixed(1)}s prima della prossima pagina...` });
            await new Promise(r => setTimeout(r, delay));
          }

          send('progress', { type: 'fetching', page, totalPages, message: `Recupero pagina ${page}/${totalPages} da OpenFoodFacts...` });

          let offResults;
          try {
            offResults = await provider.searchProducts(q, 'it', page, pageSize);
          } catch (err: any) {
            send('progress', { type: 'page_error', page, message: `Errore pagina ${page}: ${err?.message}. Salto questa pagina.` });
            continue;
          }

          // Imposta totalPages dalla risposta reale dell'API (solo alla prima pagina)
          if (page === 1) {
            const realPages = offResults.pageCount || 1;
            totalPages = Math.min(realPages, MAX_SAFETY_PAGES);
            send('progress', { type: 'total', totalPages, totalCount: offResults.count,
              message: `📊 Trovati ${offResults.count} prodotti totali — ${totalPages} pagine da importare` });
          }

          if (!offResults.products || offResults.products.length === 0) {
            send('progress', { type: 'page_empty', page, message: `Pagina ${page} vuota, stop.` });
            break;
          }

          // Cancella vecchi seed statici solo alla prima pagina
          if (page === 1) {
            await sql`DELETE FROM products WHERE id LIKE 'p%' AND length(id) <= 3`;
          }

          // Upsert categorie
          const uniqueCategoriesMap = new Map();
          for (const p of offResults.products) {
            if (!uniqueCategoriesMap.has(p.category)) uniqueCategoriesMap.set(p.category, p);
          }
          const categoryQueries = Array.from(uniqueCategoriesMap.values()).map(p => sql`
            INSERT INTO categories (id, label, emoji, color)
            VALUES (${p.category}, ${p.categoryLabel || p.category}, ${p.emoji}, ${p.categoryColor || '#6366f1'})
            ON CONFLICT (id) DO NOTHING
          `);

          // Upsert prodotti
          const rows = offResults.products.map(p => ({
            id: p.id,
            name_enc: p.name,
            description_enc: p.description,
            category: p.category,
            emoji: p.emoji,
            tags: p.tags,
            gluten_level: p.glutenLevel,
            is_gluten_free: p.isGlutenFree,
            is_custom: false,
            user_id: null,
            off_image_url: p.enrichment?.imageUrl || p.enrichment?.imageThumbnailUrl || null,
            nutriscore: p.enrichment?.nutriScore || null,
            nova_group: p.enrichment?.novaGroup || null,
            ecoscore: p.enrichment?.ecoScore || null,
            allergens: p.enrichment?.allergens || [],
            ingredients_text: p.enrichment?.ingredientsText || null,
            brand: p.enrichment?.brand || null,
            quantity: p.enrichment?.quantity || null,
          }));

          const productQueries = rows.map(r => sql`
            INSERT INTO products (
              id, name_enc, description_enc, category, emoji, tags,
              gluten_level, is_gluten_free, is_custom, user_id,
              off_image_url, nutriscore, nova_group,
              ecoscore, allergens, ingredients_text, brand, quantity
            ) VALUES (
              ${r.id}, ${r.name_enc}, ${r.description_enc}, ${r.category}, ${r.emoji}, ${r.tags},
              ${r.gluten_level}, ${r.is_gluten_free}, ${r.is_custom}, ${r.user_id},
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

          await sql.transaction([...categoryQueries, ...productQueries]);
          totalImported += rows.length;

          send('progress', {
            type: 'page_done',
            page,
            totalPages,
            pageCount: rows.length,
            totalImported,
            message: `Pagina ${page}/${totalPages}: ${rows.length} prodotti salvati (tot: ${totalImported})`
          });
        }

        send('done', {
          totalImported,
          totalPages,
          message: `Import completato: ${totalImported} prodotti importati in ${totalPages} pagine.`
        });

      } catch (err: any) {
        console.error('[bulk-import] Fatal error:', err);
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
