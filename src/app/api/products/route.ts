import { auth } from '@/lib/auth';
import { encrypt, safeDecrypt } from '@/lib/crypto';
import { ensureSchema, getDb } from '@/lib/db';
import type { Product } from '@/types';
import { OpenFoodFactsProvider } from '@/lib/product-enrichment/providers/open-food-facts';
import { buildCloudinaryUrl } from '@/lib/cloudinary';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    const category = searchParams.get('category') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);

    await ensureSchema();
    const sql = getDb();

    const queryFilter = q ? `%${q}%` : '%';
    const offset = (page - 1) * limit;

    const [publicRows, countRows] = await Promise.all([
      sql`
        SELECT * FROM products 
        WHERE is_custom = false AND name_enc ILIKE ${queryFilter}
          AND (${category} = '' OR category = ${category})
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql`
        SELECT count(*) as total FROM products 
        WHERE is_custom = false AND name_enc ILIKE ${queryFilter}
          AND (${category} = '' OR category = ${category})
      `
    ]);

    const customRows = await sql`
      SELECT * FROM products WHERE is_custom = true AND user_id = ${session.user.id}
        AND (${category} = '' OR category = ${category})
    `;

    const customProducts: Product[] = (customRows as any[]).map((row) => {
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
        // imageUrl solo se il prodotto ha un'immagine su Cloudinary
        enrichment: row.cloudinary_public_id ? {
          imageUrl: buildCloudinaryUrl(row.cloudinary_public_id as string),
        } : undefined,
      };
    }).filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.description.toLowerCase().includes(q.toLowerCase()));

    const publicProducts: Product[] = (publicRows as any[]).map((row) => ({
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
        // imageUrl solo se cloudinary_public_id è presente
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
    }));

    const publicSlice = page === 1
      ? publicProducts.slice(0, Math.max(0, limit - customProducts.length))
      : publicProducts;

    const combinedProducts = page === 1 ? [...customProducts, ...publicSlice] : publicProducts;
    const totalCount = parseInt((countRows as any[])[0].total) + customProducts.length;

    return Response.json({
      products: combinedProducts,
      count: totalCount,
      page,
      pageSize: limit,
      pageCount: Math.ceil(totalCount / limit)
    });
  } catch (err) {
    console.error('GET /api/products:', err);
    return Response.json({ error: 'Errore nel recupero prodotti' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, description, category, emoji, tags, glutenLevel, isGlutenFree } = body;

    if (!name?.trim() || !description?.trim()) {
      return Response.json({ error: 'Nome e descrizione obbligatori' }, { status: 400 });
    }

    await ensureSchema();
    const sql = getDb();

    const id = `custom-${session.user.id}-${Date.now()}`;
    const nameEnc = encrypt(name.trim());
    const descEnc = encrypt(description.trim());

    await sql`
      INSERT INTO products (
        id, name_enc, description_enc, category, emoji, tags,
        gluten_level, is_gluten_free, is_custom, user_id
      )
      VALUES (
        ${id}, ${nameEnc}, ${descEnc}, ${category}, ${emoji},
        ${tags ?? []}, ${glutenLevel ?? 'none'}, ${isGlutenFree ?? true},
        true, ${session.user.id}
      )
    `;

    const product: Product = {
      id,
      name: name.trim(),
      description: description.trim(),
      category,
      emoji,
      tags: tags ?? [],
      isGlutenFree: isGlutenFree ?? true,
      glutenLevel: glutenLevel ?? 'none',
      isCustom: true,
      // L'immagine viene caricata separatamente tramite POST /api/images/upload
      enrichment: undefined,
    };

    return Response.json(product, { status: 201 });
  } catch (err) {
    console.error('POST /api/products:', err);
    return Response.json({ error: 'Errore durante il salvataggio' }, { status: 500 });
  }
}
