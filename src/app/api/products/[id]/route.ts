import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const sql = getDb();

    // Elimina solo prodotti custom dell'utente corrente (sicurezza cross-user)
    const result = await sql`
      DELETE FROM products
      WHERE id = ${id}
        AND is_custom = true
        AND user_id = ${session.user.id}
      RETURNING id
    ` as Record<string, unknown>[];

    if (result.length === 0) {
      return Response.json(
        { error: 'Prodotto non trovato o non eliminabile' },
        { status: 404 }
      );
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/products/[id]:', err);
    return Response.json({ error: 'Errore durante l\'eliminazione' }, { status: 500 });
  }
}
