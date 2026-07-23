import { auth } from '@/lib/auth';
import { ensureSchema, getDb } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  try {
    await ensureSchema();
    const sql = getDb();

    const rows = await sql`
      SELECT c.id, c.label, c.emoji, c.color, count(p.id)::int as count
      FROM categories c
      LEFT JOIN products p ON p.category = c.id AND (p.is_custom = false OR p.user_id = ${session.user.id})
      GROUP BY c.id, c.label, c.emoji, c.color
      ORDER BY count DESC, c.label ASC
    `;

    return Response.json(rows);
  } catch (err) {
    console.error('GET /api/categories:', err);
    return Response.json({ error: 'Errore nel recupero categorie' }, { status: 500 });
  }
}
