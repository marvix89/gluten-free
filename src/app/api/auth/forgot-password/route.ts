import { getDb } from '@/lib/db';
import { randomBytes } from 'crypto';
import { sendPasswordResetEmail } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email) {
      return Response.json({ error: 'Email richiesta' }, { status: 400 });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const sql = getDb();

    // Check if user exists
    const users = await sql`
      SELECT id FROM users WHERE email = ${normalizedEmail}
    ` as Record<string, unknown>[];

    // To prevent email enumeration, always return success even if user doesn't exist
    if (users.length === 0) {
      return Response.json({ success: true });
    }

    const user = users[0];
    const token = randomBytes(32).toString('hex');
    
    // Scade tra 1 ora
    await sql`
      UPDATE users 
      SET reset_token = ${token}, reset_token_expires = NOW() + INTERVAL '1 hour'
      WHERE id = ${user.id}
    `;

    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const resetLink = `${origin}/reset-password?token=${token}`;

    await sendPasswordResetEmail(normalizedEmail, resetLink);

    return Response.json({ success: true });
  } catch (error) {
    console.error('Errore forgot password:', error);
    return Response.json({ error: 'Errore interno del server' }, { status: 500 });
  }
}
