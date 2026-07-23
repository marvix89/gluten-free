import { ensureSchema, getDb } from '../src/lib/db';
import bcrypt from 'bcryptjs';

async function main() {
  await ensureSchema();
  const sql = getDb();
  
  const email = 'admin@test.com';
  const password = 'admin';
  const hash = await bcrypt.hash(password, 10);
  
  await sql`
    INSERT INTO users (email, password_hash, is_admin)
    VALUES (${email}, ${hash}, true)
    ON CONFLICT (email) DO UPDATE SET 
      is_admin = true,
      password_hash = EXCLUDED.password_hash
  `;
  
  console.log(`✅ Utente admin creato o aggiornato: ${email} / ${password}`);
  process.exit(0);
}

main().catch(console.error);
