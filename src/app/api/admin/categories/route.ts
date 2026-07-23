import { auth } from '@/lib/auth';
import { ensureSchema, getDb } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return Response.json({ error: 'Non autorizzato' }, { status: 403 });
  }

  try {
    await ensureSchema();
    const sql = getDb();

    const rows = await sql`
      SELECT c.id, c.label, c.emoji, c.color, count(p.id)::int as count
      FROM categories c
      LEFT JOIN products p ON p.category = c.id
      GROUP BY c.id, c.label, c.emoji, c.color
      ORDER BY count DESC, c.label ASC
    `;

    return Response.json(rows);
  } catch (err) {
    console.error('GET /api/admin/categories:', err);
    return Response.json({ error: 'Errore nel recupero categorie admin' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return Response.json({ error: 'Non autorizzato' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const label = (body.label || '').trim();
    const emoji = (body.emoji || '🏷️').trim();
    const color = (body.color || '#6366f1').trim();

    if (!label) {
      return Response.json({ error: 'Il nome della categoria è obbligatorio' }, { status: 400 });
    }

    const id = body.id || label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    await ensureSchema();
    const sql = getDb();

    await sql`
      INSERT INTO categories (id, label, emoji, color)
      VALUES (${id}, ${label}, ${emoji}, ${color})
    `;

    return Response.json({ success: true, id, label, emoji, color });
  } catch (err) {
    console.error('POST /api/admin/categories:', err);
    return Response.json({ error: 'Errore durante la creazione della categoria' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return Response.json({ error: 'Non autorizzato' }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    if (url.searchParams.get('empty') === 'true') {
      await ensureSchema();
      const sql = getDb();
      await sql`
        DELETE FROM categories
        WHERE id != 'personalizzato'
        AND id NOT IN (SELECT DISTINCT category FROM products WHERE category IS NOT NULL)
      `;
      return Response.json({ success: true });
    }
    return Response.json({ error: 'Richiesta non valida' }, { status: 400 });
  } catch (err) {
    console.error('DELETE /api/admin/categories:', err);
    return Response.json({ error: 'Errore durante la pulizia delle categorie vuote' }, { status: 500 });
  }
}
