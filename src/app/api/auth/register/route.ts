import bcrypt from 'bcryptjs';
import { encrypt } from '@/lib/crypto';
import { ensureSchema, getDb } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    if (!email || !password) {
      return Response.json(
        { error: 'Email e password sono obbligatori' },
        { status: 400 }
      );
    }
    if (typeof password !== 'string' || password.length < 8) {
      return Response.json(
        { error: 'La password deve essere di almeno 8 caratteri' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return Response.json({ error: 'Formato email non valido' }, { status: 400 });
    }

    await ensureSchema();
    const sql = getDb();

    const normalizedEmail = (email as string).toLowerCase().trim();

    // Controlla se l'email è già registrata
    const existing = await sql`
      SELECT id FROM users WHERE email = ${normalizedEmail}
    ` as Record<string, unknown>[];
    if (existing.length > 0) {
      return Response.json({ error: 'Email già registrata' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const nameEnc = name ? encrypt((name as string).trim()) : null;

    await sql`
      INSERT INTO users (email, name_enc, password_hash)
      VALUES (${normalizedEmail}, ${nameEnc}, ${passwordHash})
    `;

    return Response.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error('Errore registrazione:', err);
    return Response.json(
      { error: 'Errore durante la registrazione. Riprova.' },
      { status: 500 }
    );
  }
}
