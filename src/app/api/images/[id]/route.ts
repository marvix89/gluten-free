import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { buildCloudinaryUrl } from '@/lib/cloudinary';

/**
 * GET /api/images/[id]
 *
 * Redirect sicuro all'URL CDN Cloudinary dell'immagine prodotto.
 *
 * Il proxy rimane come astrazione utile per:
 *   - Verificare che l'utente sia autenticato prima di servire l'immagine
 *   - Compatibilità con eventuali chiamate legacy
 *   - Possibilità futura di aggiungere logica (es. watermark, accesso granulare)
 *
 * L'immagine è servita direttamente dalla CDN Cloudinary (nessun proxy load).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Non autorizzato', { status: 401 });
  }

  try {
    const { id } = await params;
    const sql = getDb();

    const [row] = await sql`
      SELECT cloudinary_public_id FROM products WHERE id = ${id}
    ` as { cloudinary_public_id: string | null }[];

    if (!row?.cloudinary_public_id || row.cloudinary_public_id === 'none') {
      return new Response('Nessuna immagine disponibile', { status: 404 });
    }

    // Redirect 302 alla CDN Cloudinary — zero banda consumata dal server
    const cdnUrl = buildCloudinaryUrl(row.cloudinary_public_id);
    if (!cdnUrl) {
      return new Response('Nessuna immagine disponibile', { status: 404 });
    }
    return Response.redirect(cdnUrl, 302);

  } catch (err) {
    console.error('GET /api/images/[id]:', err);
    return new Response('Errore interno del server', { status: 500 });
  }
}
