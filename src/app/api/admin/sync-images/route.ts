import { auth } from '@/lib/auth';
import { ensureSchema, getDb } from '@/lib/db';
import cloudinary, { getProductPublicId, ensureCloudinaryConfig } from '@/lib/cloudinary';
import { getEnrichmentProvider } from '@/lib/product-enrichment';

/**
 * POST /api/admin/sync-images
 *
 * Sincronizza le immagini prodotto su Cloudinary.
 * Usa off_image_url (URL originale OpenFoodFacts) come sorgente.
 *
 * Cloudinary scarica direttamente dall'URL OFF senza che il nostro server
 * faccia da intermediario (risparmio di RAM e bandwidth).
 *
 * Body: { page, pageSize }
 * Risposta: { processed, succeeded, failed, totalPending, page, totalPages }
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return Response.json({ error: 'Accesso negato: richiesti permessi di amministratore' }, { status: 403 });
  }

  try {
    ensureCloudinaryConfig();
    const body = await request.json().catch(() => ({}));
    const page = parseInt(body.page || '1', 10);
    const pageSize = parseInt(body.pageSize || '10', 10);
    const offset = (page - 1) * pageSize;

    await ensureSchema();
    const sql = getDb();

    // Prodotti senza immagine su Cloudinary
    const [countRow] = await sql`
      SELECT count(*)::int AS total FROM products
      WHERE is_custom = false
        AND cloudinary_public_id IS NULL
    ` as { total: number }[];

    const totalPending = countRow?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalPending / pageSize));

    const rows = await sql`
      SELECT id, off_image_url FROM products
      WHERE is_custom = false
        AND cloudinary_public_id IS NULL
      ORDER BY created_at DESC
      LIMIT ${pageSize}
    ` as { id: string; off_image_url: string | null }[];

    const provider = getEnrichmentProvider();
    let succeeded = 0;
    let failed = 0;

    // FASE 1: Risoluzione URL da OpenFoodFacts in modo controllato (max 2 alla volta con pausa 300ms)
    // per evitare errore 429 Too Many Requests.
    const offChunkSize = 2;
    for (let i = 0; i < rows.length; i += offChunkSize) {
      const chunk = rows.slice(i, i + offChunkSize);
      const needsLookup = chunk.filter(r => !r.off_image_url);
      if (needsLookup.length > 0) {
        await Promise.all(needsLookup.map(async (row) => {
          try {
            const offData = await provider.fetchByBarcode(row.id);
            const sourceUrl = offData?.imageUrl || offData?.imageThumbnailUrl || null;
            row.off_image_url = sourceUrl;
            if (sourceUrl) {
              await sql`UPDATE products SET off_image_url = ${sourceUrl} WHERE id = ${row.id}`;
            }
          } catch (e) {
            console.error(`sync-images: lookup OFF fallito per ${row.id}:`, e);
          }
        }));
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // FASE 2: Caricamento su Cloudinary (2 alla volta con pausa 300ms) per prevenire rate limit 429
    const uploadChunkSize = 2;
    for (let i = 0; i < rows.length; i += uploadChunkSize) {
      const chunk = rows.slice(i, i + uploadChunkSize);
      await Promise.all(chunk.map(async (row) => {
        const sourceUrl = row.off_image_url;

        if (!sourceUrl) {
          await sql`UPDATE products SET cloudinary_public_id = 'none' WHERE id = ${row.id}`;
          failed++;
          return;
        }

        try {
          const publicId = getProductPublicId(row.id);
          let finalPublicId = publicId;
          try {
            const result = await cloudinary.uploader.upload(sourceUrl, {
              public_id: publicId,
              overwrite: false,
              quality: 'auto',
              fetch_format: 'auto',
            });
            finalPublicId = result.public_id;
          } catch (uploadErr: any) {
            const msg = uploadErr?.message || uploadErr?.error?.message || '';
            if (msg.includes('already exists') || uploadErr?.http_code === 400) {
              console.log(`Immagine per ${row.id} già presente su Cloudinary.`);
            } else {
              throw uploadErr;
            }
          }

          await sql`
            UPDATE products
            SET cloudinary_public_id = ${finalPublicId}
            WHERE id = ${row.id}
          `;

          succeeded++;
        } catch (err: any) {
          const errMsg = err?.message || err?.error?.message || '';
          const httpCode = err?.http_code || err?.error?.http_code || err?.status;
          const is429OrTemp = httpCode === 429 || httpCode >= 500 || errMsg.includes('429') || errMsg.includes('Too Many Requests') || errMsg.includes('timeout') || errMsg.includes('Rate limit');

          if (is429OrTemp) {
            console.warn(`sync-images: rate limit o errore temporaneo per prodotto ${row.id}, resterà in coda:`, errMsg);
          } else {
            console.error(`sync-images: errore permanente per prodotto ${row.id}:`, err);
            await sql`UPDATE products SET cloudinary_public_id = 'none' WHERE id = ${row.id}`;
          }
          failed++;
        }
      }));
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    const [stats] = await sql`
      SELECT
        count(*) FILTER (WHERE is_custom = false)::int AS total_public,
        count(*) FILTER (WHERE is_custom = false AND cloudinary_public_id IS NOT NULL AND cloudinary_public_id != 'none')::int AS with_image,
        count(*) FILTER (WHERE is_custom = false AND cloudinary_public_id IS NULL)::int AS pending_image
      FROM products
    ` as { total_public: number; with_image: number; pending_image: number }[];
    const remainingPending = stats?.pending_image ?? 0;

    return Response.json({
      success: true,
      processed: rows.length,
      succeeded,
      failed,
      totalPending: remainingPending,
      stats: {
        total_public: stats?.total_public ?? 0,
        with_image: stats?.with_image ?? 0,
        pending_image: stats?.pending_image ?? 0,
      },
      page: 1,
      totalPages: Math.max(1, Math.ceil(remainingPending / pageSize)),
    });

  } catch (err) {
    console.error('POST /api/admin/sync-images:', err);
    return Response.json({ error: 'Errore durante la sincronizzazione immagini' }, { status: 500 });
  }
}

/**
 * GET /api/admin/sync-images
 * Statistiche: quanti prodotti hanno cloudinary_public_id vs quanti ne hanno ancora bisogno.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return Response.json({ error: 'Accesso negato' }, { status: 403 });
  }

  try {
    await ensureSchema();
    const sql = getDb();

    const [stats] = await sql`
      SELECT
        count(*) FILTER (WHERE is_custom = false)::int AS total_public,
        count(*) FILTER (WHERE is_custom = false AND cloudinary_public_id IS NOT NULL AND cloudinary_public_id != 'none')::int AS with_image,
        count(*) FILTER (WHERE is_custom = false AND cloudinary_public_id IS NULL)::int AS pending_image
      FROM products
    ` as { total_public: number; with_image: number; pending_image: number }[];

    return Response.json(stats);
  } catch (err) {
    console.error('GET /api/admin/sync-images:', err);
    return Response.json({ error: 'Errore nel recupero statistiche' }, { status: 500 });
  }
}
