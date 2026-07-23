import { auth } from '@/lib/auth';
import { ensureSchema, getDb } from '@/lib/db';
import { OpenFoodFactsProvider } from '@/lib/product-enrichment/providers/open-food-facts';
import { pipeline } from '@xenova/transformers';
import { buildCloudinaryUrl } from '@/lib/cloudinary';
import { safeDecrypt } from '@/lib/crypto';
import { fuseVisionAndText, ZERO_SHOT_FOOD_CANDIDATES } from '@/utils/taxonomy';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

class BatchClassifierSingleton {
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
    const body = await req.json().catch(() => ({}));
    const onlyCustom = body.onlyCustom ?? true;

    await ensureSchema();
    const sql = getDb();

    // 1. Recupera i prodotti da analizzare
    const products = onlyCustom
      ? (await sql`SELECT id, name_enc, description_enc, tags, category, emoji, off_image_url, cloudinary_public_id, is_custom FROM products WHERE category = 'personalizzato'`) as any[]
      : (await sql`SELECT id, name_enc, description_enc, tags, category, emoji, off_image_url, cloudinary_public_id, is_custom FROM products`) as any[];

    const provider = new OpenFoodFactsProvider();
    const updates: { id: string; catId: string; label: string; emoji: string; color: string }[] = [];
    const uniqueCats = new Map<string, { id: string; label: string; emoji: string; color: string }>();

    // Prepariamo il classificatore AI in memoria per il batch visuale
    let classifier: any = null;

    for (const p of products) {
      let cat: { id: string; label: string; emoji: string; color: string } | null = null;
      const decryptedName = safeDecrypt(p.name_enc as string, Boolean(p.is_custom));
      const decryptedDesc = safeDecrypt(p.description_enc as string, Boolean(p.is_custom));

      const nlpCat = provider.categorizeProduct({
        name_enc: decryptedName,
        description_enc: decryptedDesc,
        tags: p.tags || [],
        categories_tags: p.tags || []
      });

      if (nlpCat.level === 1 || nlpCat.level === 2) {
        cat = nlpCat;
      } else {
        const imageUrl = buildCloudinaryUrl(p.cloudinary_public_id, { width: 224, height: 224 }) || p.off_image_url;
        if (imageUrl) {
          try {
            if (!classifier) {
              classifier = await BatchClassifierSingleton.getInstance();
            }
            const candidateLabels = ZERO_SHOT_FOOD_CANDIDATES.map(c => c.label);
            const predictions = await classifier(imageUrl, candidateLabels);
            const textContext = [decryptedName, decryptedDesc, ...(p.tags || [])].filter(Boolean).join(' ');
            const hybridResult = fuseVisionAndText(predictions, textContext, nlpCat.id);
            if (hybridResult) {
              cat = {
                id: hybridResult.categoryId,
                label: hybridResult.categoryLabel,
                emoji: hybridResult.emoji,
                color: hybridResult.color,
              };
            }
          } catch (imgErr) {
            // Ignoriamo errori sul singolo fetch o inferenza visuale per non interrompere il batch
          }
        }
      }

      if (!cat) {
        cat = nlpCat;
      }

      uniqueCats.set(cat.id, cat);

      if (cat.id !== p.category || cat.emoji !== p.emoji) {
        updates.push({
          id: p.id,
          catId: cat.id,
          label: cat.label,
          emoji: cat.emoji,
          color: cat.color
        });
      }
    }

    // 2. Inserisci tutte le nuove categorie individuate
    for (const cat of uniqueCats.values()) {
      await sql`
        INSERT INTO categories (id, label, emoji, color)
        VALUES (${cat.id}, ${cat.label}, ${cat.emoji}, ${cat.color})
        ON CONFLICT (id) DO UPDATE SET
          label = EXCLUDED.label,
          emoji = EXCLUDED.emoji,
          color = EXCLUDED.color
      `;
    }

    // 3. Esegui gli aggiornamenti sui prodotti a blocchi di 50 per massima velocità
    const chunkSize = 50;
    for (let i = 0; i < updates.length; i += chunkSize) {
      const chunk = updates.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(u => sql`
          UPDATE products
          SET category = ${u.catId}, emoji = ${u.emoji}
          WHERE id = ${u.id}
        `)
      );
    }

    return Response.json({
      success: true,
      totalAnalyzed: products.length,
      updatedCount: updates.length
    });
  } catch (err) {
    console.error('POST /api/admin/re-categorize-all:', err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
