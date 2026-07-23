import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { encrypt, safeDecrypt } from '@/lib/crypto';
import bcrypt from 'bcryptjs';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Non autorizzato' }, { status: 401 });
    }

    const sql = getDb();
    const rows = await sql`
      SELECT email, name_enc
      FROM users
      WHERE id = ${session.user.id}
    ` as Record<string, unknown>[];

    if (rows.length === 0) {
      return Response.json({ error: 'Utente non trovato' }, { status: 404 });
    }

    const user = rows[0];
    const name = user.name_enc ? safeDecrypt(user.name_enc as string, true) : '';

    return Response.json({
      email: user.email,
      name,
    });
  } catch (error) {
    console.error('Errore nel caricamento del profilo:', error);
    return Response.json({ error: 'Errore interno' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Non autorizzato' }, { status: 401 });
    }

    const body = await request.json();
    const { name, email, currentPassword, newPassword } = body;

    const sql = getDb();

    // Check existing user to verify password if updating password
    const rows = await sql`
      SELECT password_hash FROM users WHERE id = ${session.user.id}
    ` as Record<string, unknown>[];

    if (rows.length === 0) {
      return Response.json({ error: 'Utente non trovato' }, { status: 404 });
    }

    const user = rows[0];

    // Se si sta cambiando la password, verifica la vecchia
    let newPasswordHash = undefined;
    if (newPassword) {
      if (!currentPassword) {
        return Response.json({ error: 'Password attuale richiesta' }, { status: 400 });
      }
      const isValid = await bcrypt.compare(currentPassword, user.password_hash as string);
      if (!isValid) {
        return Response.json({ error: 'Password attuale errata' }, { status: 400 });
      }
      if (newPassword.length < 8) {
        return Response.json({ error: 'La nuova password deve essere di almeno 8 caratteri' }, { status: 400 });
      }
      newPasswordHash = await bcrypt.hash(newPassword, 12);
    }

    // Se si sta cambiando email, verifica che non sia già in uso da altri
    let normalizedEmail = undefined;
    if (email) {
      normalizedEmail = (email as string).toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        return Response.json({ error: 'Formato email non valido' }, { status: 400 });
      }

      const existingEmail = await sql`
        SELECT id FROM users WHERE email = ${normalizedEmail} AND id != ${session.user.id}
      ` as Record<string, unknown>[];
      if (existingEmail.length > 0) {
        return Response.json({ error: 'Email già in uso da un altro utente' }, { status: 409 });
      }
    }

    const nameEnc = name !== undefined ? encrypt((name as string).trim()) : undefined;

    // Costruisci e riga la query dinamicamente (Neon Serverless non supporta query builder avanzati, facciamo update multipli o usiamo COALESCE)
    if (newPasswordHash) {
       await sql`UPDATE users SET password_hash = ${newPasswordHash} WHERE id = ${session.user.id}`;
    }
    if (normalizedEmail) {
       await sql`UPDATE users SET email = ${normalizedEmail} WHERE id = ${session.user.id}`;
    }
    if (nameEnc !== undefined) {
       await sql`UPDATE users SET name_enc = ${nameEnc} WHERE id = ${session.user.id}`;
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Errore aggiornamento profilo:', error);
    return Response.json({ error: 'Errore durante l\'aggiornamento' }, { status: 500 });
  }
}
