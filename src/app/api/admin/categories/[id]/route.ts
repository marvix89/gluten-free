import { auth } from '@/lib/auth';
import { ensureSchema, getDb } from '@/lib/db';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return Response.json({ error: 'Non autorizzato' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const label = (body.label || '').trim();
    const emoji = (body.emoji || '🏷️').trim();
    const color = (body.color || '#6366f1').trim();

    if (!label) {
      return Response.json({ error: 'Il nome della categoria è obbligatorio' }, { status: 400 });
    }

    await ensureSchema();
    const sql = getDb();

    await sql`
      UPDATE categories
      SET label = ${label}, emoji = ${emoji}, color = ${color}
      WHERE id = ${id}
    `;

    return Response.json({ success: true, id, label, emoji, color });
  } catch (err) {
    console.error('PUT /api/admin/categories/[id]:', err);
    return Response.json({ error: 'Errore durante la modifica della categoria' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return Response.json({ error: 'Non autorizzato' }, { status: 403 });
  }

  try {
    const { id } = await params;

    if (id === 'personalizzato') {
      return Response.json({ error: 'Impossibile eliminare la categoria predefinita Personalizzato' }, { status: 400 });
    }

    await ensureSchema();
    const sql = getDb();

    // Riassegna eventuali prodotti associati alla categoria personalizzato
    await sql`
      UPDATE products
      SET category = 'personalizzato'
      WHERE category = ${id}
    `;

    // Elimina la categoria
    await sql`DELETE FROM categories WHERE id = ${id}`;

    return Response.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/categories/[id]:', err);
    return Response.json({ error: 'Errore durante l\'eliminazione della categoria' }, { status: 500 });
  }
}
