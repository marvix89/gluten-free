import { auth } from '@/lib/auth';
import { safeDecrypt } from '@/lib/crypto';
import { ensureSchema, getDb } from '@/lib/db';
import { buildCloudinaryUrl } from '@/lib/cloudinary';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return Response.json({ error: 'Non autorizzato' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');

    await ensureSchema();
    const sql = getDb();

    const rows = category
      ? await sql`SELECT id, name_enc, description_enc, category, emoji, tags, off_image_url, cloudinary_public_id, is_custom FROM products WHERE category = ${category} ORDER BY created_at DESC LIMIT 300`
      : await sql`SELECT id, name_enc, description_enc, category, emoji, tags, off_image_url, cloudinary_public_id, is_custom FROM products ORDER BY created_at DESC LIMIT 300`;

    const products = (rows as any[]).map(row => {
      const isCustom = Boolean(row.is_custom);
      const name = safeDecrypt(row.name_enc as string, isCustom);
      const desc = safeDecrypt(row.description_enc as string, isCustom);
      const imageUrl = buildCloudinaryUrl(row.cloudinary_public_id, { width: 250, height: 250 }) || row.off_image_url || null;
      return {
        id: row.id,
        name,
        description: desc,
        category: row.category,
        emoji: row.emoji,
        tags: row.tags || [],
        imageUrl,
        isCustom: row.is_custom,
      };
    });

    return Response.json({ success: true, products, count: products.length });
  } catch (err) {
    console.error('GET /api/admin/products:', err);
    return Response.json({ error: 'Errore durante il caricamento dei prodotti della categoria' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return Response.json({ error: 'Non autorizzato' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { productId, categoryId, emoji } = body;

    if (!productId || !categoryId) {
      return Response.json({ error: 'Parametri mancanti per la modifica di categoria' }, { status: 400 });
    }

    await ensureSchema();
    const sql = getDb();

    await sql`
      UPDATE products
      SET category = ${categoryId}, emoji = ${emoji || '🌟'}
      WHERE id = ${productId}
    `;

    return Response.json({ success: true });
  } catch (err) {
    console.error('PUT /api/admin/products:', err);
    return Response.json({ error: 'Errore durante l\'aggiornamento del prodotto' }, { status: 500 });
  }
}
