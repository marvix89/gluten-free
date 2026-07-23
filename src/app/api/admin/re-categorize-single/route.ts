import { auth } from '@/lib/auth';
import { ensureSchema, getDb } from '@/lib/db';
import { OpenFoodFactsProvider } from '@/lib/product-enrichment/providers/open-food-facts';
import { pipeline } from '@xenova/transformers';
import { buildCloudinaryUrl } from '@/lib/cloudinary';
import { safeDecrypt } from '@/lib/crypto';
import { fuseVisionAndText, ZERO_SHOT_FOOD_CANDIDATES } from '@/utils/taxonomy';

export const maxDuration = 25;
export const dynamic = 'force-dynamic';

class SingleClassifierSingleton {
  static instance: Promise<any> | null = null;
  static async getInstance() {
    if (this.instance === null) {
      this.instance = pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32', { quantized: true });
    }
    return this.instance;
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return Response.json({ error: 'Accesso negato: richiesti permessi di amministratore' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { productId, confirm, categoryId, emoji } = body;

    if (!productId) {
      return Response.json({ error: 'ID prodotto mancante' }, { status: 400 });
    }

    await ensureSchema();
    const sql = getDb();

    if (confirm && categoryId) {
      await sql`
        UPDATE products
        SET category = ${categoryId}, emoji = ${emoji || '📦'}
        WHERE id = ${productId}
      `;
      return Response.json({ success: true, productId, categoryId });
    }

    const rows = (await sql`
      SELECT id, name_enc, description_enc, tags, category, emoji, off_image_url, cloudinary_public_id, is_custom
      FROM products WHERE id = ${productId}
    `) as any[];

    if (!rows || rows.length === 0) {
      return Response.json({ error: 'Prodotto non trovato nel database' }, { status: 404 });
    }

    const p = rows[0];
    const oldCategory = p.category;
    const provider = new OpenFoodFactsProvider();

    const decryptedName = safeDecrypt(p.name_enc as string, Boolean(p.is_custom));
    const decryptedDesc = safeDecrypt(p.description_enc as string, Boolean(p.is_custom));

    let cat: { id: string; label: string; emoji: string; color: string } | null = null;
    let method = 'Analisi NLP Testuale';
    let confidence = 0.15;
    let topPredictions: Array<{ label: string; score: number }> = [];

    const imageUrl = buildCloudinaryUrl(p.cloudinary_public_id, { width: 224, height: 224 }) || p.off_image_url;

    const nlpCat = provider.categorizeProduct({
      name_enc: decryptedName,
      description_enc: decryptedDesc,
      tags: p.tags || [],
      categories_tags: p.tags || []
    });

    if (nlpCat.level === 1 || nlpCat.level === 2) {
      cat = nlpCat;
      method = nlpCat.method || (nlpCat.level === 1 ? 'Livello 1: Tag Ufficiali OpenFoodFacts' : 'Livello 2: Motore Scoring Matrix');
      confidence = nlpCat.confidence || 0.95;
    }

    if (imageUrl) {
      try {
        const classifier = await SingleClassifierSingleton.getInstance();
        const candidateLabels = ZERO_SHOT_FOOD_CANDIDATES.map(c => c.label);
        const predictions = await classifier(imageUrl, candidateLabels);
        
        const textContext = [decryptedName, decryptedDesc, ...(p.tags || [])].filter(Boolean).join(' ');
        const hybridResult = fuseVisionAndText(predictions, textContext, nlpCat.id);
        if (hybridResult) {
          topPredictions = hybridResult.topPredictions;
          // Se eravamo al Livello 3 (incerto), o se il consenso visivo conferma/eleva
          if (!cat || nlpCat.level === 3) {
            cat = {
              id: hybridResult.categoryId,
              label: hybridResult.categoryLabel,
              emoji: hybridResult.emoji,
              color: hybridResult.color,
            };
            method = 'Livello 3: Fallback AI Visiva Gratuito (CLIP)';
            confidence = hybridResult.confidence;
          }
        }
      } catch (imgErr) {
        console.warn('Errore durante analisi visuale CLIP del singolo prodotto:', imgErr);
      }
    }

    if (!cat) {
      cat = nlpCat;
      method = nlpCat.method || 'Analisi Fallback Database';
      confidence = nlpCat.confidence || 0.15;
    }

    return Response.json({
      success: true,
      productId: p.id,
      productName: decryptedName || 'Prodotto senza nome',
      oldCategory,
      newCategory: cat,
      method,
      confidence: Math.round(confidence * 100),
      topPredictions: topPredictions.slice(0, 3),
    });
  } catch (err) {
    console.error('POST /api/admin/re-categorize-single:', err);
    return Response.json({ error: 'Errore durante la categorizzazione AI del prodotto' }, { status: 500 });
  }
}
