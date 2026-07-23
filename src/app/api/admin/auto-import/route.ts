import { auth } from '@/lib/auth';
import { ensureSchema, getDb } from '@/lib/db';
import { OpenFoodFactsProvider } from '@/lib/product-enrichment/providers/open-food-facts';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return Response.json({ error: 'Accesso negato: richiesti permessi di amministratore' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const q = body.q || '';
    const page = parseInt(body.page || '1', 10);
    const limit = parseInt(body.limit || '25', 10);
    const locale = 'it';

    const provider = new OpenFoodFactsProvider();
    const offResults = await provider.searchProducts(q, locale, page, limit);

    if (!offResults.products || offResults.products.length === 0) {
      return Response.json({ success: true, count: 0, products: [], pageCount: 0, totalCount: 0, currentPage: page });
    }

    await ensureSchema();
    const sql = getDb();

    // Le immagini vengono sincronizzate separatamente tramite /api/admin/sync-images
    // per non bloccare l'importazione dei dati prodotto.
    // off_image_url salva l'URL originale OFF: sarà usato da sync-images per caricare su Cloudinary.
    const rowsToInsert = offResults.products.map(p => ({
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

    // Cancellazione vecchi seed statici (i loro id erano p1, p2... p27)
    await sql`DELETE FROM products WHERE id LIKE 'p%' AND length(id) <= 3`;

    const uniqueCategoriesMap = new Map();
    for (const p of offResults.products) {
      if (!uniqueCategoriesMap.has(p.category)) {
        uniqueCategoriesMap.set(p.category, p);
      }
    }

    const categoryQueries = Array.from(uniqueCategoriesMap.values()).map(p => sql`
      INSERT INTO categories (id, label, emoji, color)
      VALUES (${p.category}, ${p.categoryLabel || p.category}, ${p.emoji}, ${p.categoryColor || '#6366f1'})
      ON CONFLICT (id) DO NOTHING
    `);

    const productQueries = rowsToInsert.map(r => sql`
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

    return Response.json({
      success: true,
      count: offResults.products.length,
      products: offResults.products,
      pageCount: offResults.pageCount,
      totalCount: offResults.count,
      currentPage: offResults.page
    });

  } catch (err) {
    console.error('POST /api/admin/auto-import:', err);
    return Response.json({ error: 'Errore durante l\'importazione dei prodotti da OFF' }, { status: 500 });
  }
}
