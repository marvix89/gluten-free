import { ensureSchema, getDb } from '../src/lib/db';

async function main() {
  await ensureSchema();
  const sql = getDb();
  
  const columns = [
    'id', 'name_enc', 'description_enc', 'category', 'emoji', 'tags',
    'gluten_level', 'is_gluten_free', 'is_custom', 'user_id',
    'image_url', 'image_thumbnail_url', 'nutriscore', 'nova_group',
    'ecoscore', 'allergens', 'ingredients_text', 'brand', 'quantity'
  ];

  const row = {
    id: 'test-123',
    name_enc: 'Test',
    description_enc: 'Test desc',
    category: 'personalizzato',
    emoji: '🛒',
    tags: ['en:test'],
    gluten_level: 'none',
    is_gluten_free: true,
    is_custom: false,
    user_id: null,
    image_url: null,
    image_thumbnail_url: null,
    nutriscore: null,
    nova_group: null,
    ecoscore: null,
    allergens: ['en:test'],
    ingredients_text: null,
    brand: null,
    quantity: null
  };

  const queries = [row, row].map(r => sql`
    INSERT INTO products (
      id, name_enc, description_enc, category, emoji, tags,
      gluten_level, is_gluten_free, is_custom, user_id,
      image_url, image_thumbnail_url, nutriscore, nova_group,
      ecoscore, allergens, ingredients_text, brand, quantity
    ) VALUES (
      ${r.id}, ${r.name_enc}, ${r.description_enc}, ${r.category}, ${r.emoji}, ${r.tags},
      ${r.gluten_level}, ${r.is_gluten_free}, ${r.is_custom}, ${r.user_id},
      ${r.image_url}, ${r.image_thumbnail_url}, ${r.nutriscore}, ${r.nova_group},
      ${r.ecoscore}, ${r.allergens}, ${r.ingredients_text}, ${r.brand}, ${r.quantity}
    )
    ON CONFLICT (id) DO UPDATE SET name_enc = EXCLUDED.name_enc
  `);

  try {
    await sql.transaction(queries);
    console.log('✅ Inserimento test riuscito');
    
    // Cleanup
    await sql`DELETE FROM products WHERE id = 'test-123'`;
  } catch (err) {
    console.error('❌ Errore di inserimento:', err);
  }
  process.exit(0);
}

main().catch(console.error);
