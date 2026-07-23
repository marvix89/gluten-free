import { auth } from '@/lib/auth';
import { safeDecrypt } from '@/lib/crypto';
import { ensureSchema, getDb } from '@/lib/db';
import type { Product } from '@/types';
import { buildCloudinaryUrl } from '@/lib/cloudinary';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  try {
    await ensureSchema();
    const sql = getDb();

    const rows = await sql`
      SELECT p.* FROM favorites f
      JOIN products p ON f.product_id = p.id
      WHERE f.user_id = ${session.user.id}
      ORDER BY f.created_at DESC
    ` as Record<string, unknown>[];

    const products: Product[] = rows.map((row) => {
      if (row.is_custom) {
        const name = safeDecrypt(row.name_enc as string, true);
        const desc = safeDecrypt(row.description_enc as string, true);
        return {
          id: row.id as string,
          name,
          description: desc,
          category: row.category as Product['category'],
          emoji: row.emoji as string,
          tags: (row.tags as string[]) || [],
          isGlutenFree: row.is_gluten_free as boolean,
          glutenLevel: row.gluten_level as Product['glutenLevel'],
          isCustom: true,
          enrichment: row.cloudinary_public_id ? {
            imageUrl: buildCloudinaryUrl(row.cloudinary_public_id as string),
            imageThumbnailUrl: buildCloudinaryUrl(row.cloudinary_public_id as string),
          } : undefined,
        };
      } else {
        return {
          id: row.id as string,
          name: row.name_enc as string,
          description: row.description_enc as string,
          category: row.category as Product['category'],
          emoji: row.emoji as string,
          tags: (row.tags as string[]) || [],
          isGlutenFree: row.is_gluten_free as boolean,
          glutenLevel: row.gluten_level as Product['glutenLevel'],
          isCustom: false,
          enrichment: {
            brand: row.brand as string,
            quantity: row.quantity as string,
            imageUrl: row.cloudinary_public_id
              ? buildCloudinaryUrl(row.cloudinary_public_id as string)
              : undefined,
            imageThumbnailUrl: row.cloudinary_public_id
              ? buildCloudinaryUrl(row.cloudinary_public_id as string)
              : undefined,
            ingredientsText: row.ingredients_text as string,
            nutriScore: row.nutriscore as any,
            novaGroup: row.nova_group as 1 | 2 | 3 | 4 | undefined,
            ecoScore: row.ecoscore as any,
            allergens: row.allergens as string[],
            labels: row.tags as string[],
          }
        };
      }
    });

    return Response.json(products);
  } catch (err) {
    console.error('GET /api/favorites:', err);
    return Response.json({ error: 'Errore nel recupero preferiti' }, { status: 500 });
  }
}
