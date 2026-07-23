import { neon, type NeonQueryFunction } from '@neondatabase/serverless';


let schemaReady = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlFn = NeonQueryFunction<any, any>;

function getDb(): SqlFn {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL non impostata');
  return neon(url) as SqlFn;
}

export { getDb };

/**
 * Crea le tabelle se non esistono e fa il seed dei prodotti statici.
 * Idempotente — sicuro da chiamare ad ogni request.
 */
export async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  const sql = getDb();
  // Cleanup di tabelle non più in uso
  await sql`DROP TABLE IF EXISTS product_translations`;

  await sql`
    CREATE TABLE IF NOT EXISTS categories (
      id         TEXT        PRIMARY KEY,
      label      TEXT        NOT NULL,
      emoji      TEXT        NOT NULL DEFAULT '🏷️',
      color      TEXT        NOT NULL DEFAULT '#6366f1',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    INSERT INTO categories (id, label, emoji, color) VALUES
      ('cereali-alternativi', 'Cereali Alternativi', '🌾', '#7c3aed'),
      ('pasta-riso', 'Pasta & Riso', '🍝', '#d97706'),
      ('pane-prodotti-da-forno', 'Pane & Prodotti da Forno', '🍞', '#16a34a'),
      ('dolci-biscotti', 'Dolci & Biscotti', '🍪', '#be185d'),
      ('piatti-pronti', 'Piatti Pronti', '🍳', '#0891b2'),
      ('snack-salati', 'Snack Salati', '🥨', '#b45309'),
      ('personalizzato', 'Personalizzato', '⭐', '#f59e0b')
    ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      email         TEXT        NOT NULL UNIQUE,
      name_enc      TEXT,
      password_hash TEXT        NOT NULL,
      reset_token   TEXT,
      reset_token_expires TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_admin      BOOLEAN     NOT NULL DEFAULT false
    )
  `;

  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false`;

  await sql`
    CREATE TABLE IF NOT EXISTS products (
      id              TEXT        PRIMARY KEY,
      name_enc        TEXT        NOT NULL,
      description_enc TEXT        NOT NULL,
      category        TEXT        NOT NULL,
      emoji           TEXT        NOT NULL,
      tags            TEXT[]      NOT NULL DEFAULT '{}',
      gluten_level    TEXT        NOT NULL DEFAULT 'none',
      is_gluten_free  BOOLEAN     NOT NULL DEFAULT true,
      is_custom       BOOLEAN     NOT NULL DEFAULT false,
      user_id         UUID        REFERENCES users(id) ON DELETE CASCADE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      
      -- Enrichment columns
      off_image_url        TEXT,        -- URL originale OpenFoodFacts (solo per sync immagini)
      cloudinary_public_id TEXT,        -- public_id su Cloudinary (es. gluten-free/products/123)
      nutriscore           TEXT,
      nova_group           INT,
      ecoscore             TEXT,
      allergens            TEXT[],
      ingredients_text     TEXT,
      nutriments           JSONB,
      brand                TEXT,
      quantity             TEXT
    )
  `;

  // Aggiunta colonne correnti se non presenti
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS off_image_url TEXT`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS cloudinary_public_id TEXT`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS nutriscore TEXT`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS nova_group INT`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS ecoscore TEXT`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS allergens TEXT[]`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS ingredients_text TEXT`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS nutriments JSONB`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity TEXT`;

  // Tabella legacy product_images — rimossa
  await sql`DROP TABLE IF EXISTS product_images`;

  await sql`
    CREATE TABLE IF NOT EXISTS favorites (
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, product_id)
    )
  `;

  schemaReady = true;
}
