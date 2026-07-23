import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  try {
    const { id: productId } = await params;
    const sql = getDb();

    await sql`
      INSERT INTO favorites (user_id, product_id)
      VALUES (${session.user.id}, ${productId})
      ON CONFLICT DO NOTHING
    `;

    return Response.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error('POST /api/favorites/[id]:', err);
    return Response.json({ error: 'Errore durante l\'aggiunta ai preferiti' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  try {
    const { id: productId } = await params;
    const sql = getDb();

    await sql`
      DELETE FROM favorites
      WHERE user_id = ${session.user.id} AND product_id = ${productId}
    `;

    return Response.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/favorites/[id]:', err);
    return Response.json({ error: 'Errore durante la rimozione dai preferiti' }, { status: 500 });
  }
}
