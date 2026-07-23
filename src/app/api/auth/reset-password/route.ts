import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return Response.json({ error: 'Token e password richiesti' }, { status: 400 });
    }

    if (password.length < 8) {
      return Response.json({ error: 'La password deve essere di almeno 8 caratteri' }, { status: 400 });
    }

    const sql = getDb();

    // Trova l'utente col token e verifica che non sia scaduto
    const users = await sql`
      SELECT id FROM users 
      WHERE reset_token = ${token} 
      AND reset_token_expires > NOW()
    ` as Record<string, unknown>[];

    if (users.length === 0) {
      return Response.json({ error: 'Link non valido o scaduto. Richiedi un nuovo ripristino.' }, { status: 400 });
    }

    const user = users[0];
    const passwordHash = await bcrypt.hash(password, 12);

    // Aggiorna password e rimuovi token
    await sql`
      UPDATE users 
      SET password_hash = ${passwordHash}, reset_token = NULL, reset_token_expires = NULL
      WHERE id = ${user.id}
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error('Errore reset password:', error);
    return Response.json({ error: 'Errore interno del server' }, { status: 500 });
  }
}
