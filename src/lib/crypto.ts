import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('Variabile d\'ambiente ENCRYPTION_KEY non impostata');
  }
  if (key.length !== 64) {
    throw new Error('ENCRYPTION_KEY deve essere una stringa hex di 64 caratteri (32 bytes)');
  }
  return Buffer.from(key, 'hex');
}

/**
 * Cifra un testo con AES-256-GCM.
 * Ogni chiamata usa un IV casuale → output diverso per lo stesso input.
 * Formato output: "ivHex:authTagHex:ciphertextHex"
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12); // 96-bit IV (raccomandato per GCM)
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag(); // 128-bit authentication tag

  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

/**
 * Decifra un testo cifrato con encrypt().
 * Lancia eccezione se il dato è stato manomesso (authTag invalido).
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(':');

  if (parts.length !== 3) {
    throw new Error('Formato ciphertext non valido');
  }

  const [ivHex, authTagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(dataHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Decifra solo se isEncrypted è true, altrimenti restituisce il valore as-is.
 * Usato per distinguere prodotti statici (testo in chiaro) da custom (cifrati).
 */
export function safeDecrypt(value: string, isEncrypted: boolean): string {
  if (!isEncrypted || !value) return value;
  // Se la stringa non ha esattamente 2 due punti, non può essere un ciphertext cifrato in formato iv:authTag:ciphertext -> restituisci in chiaro
  if (typeof value === 'string' && value.split(':').length !== 3) {
    return value;
  }
  try {
    return decrypt(value);
  } catch {
    return '[Errore decifratura]';
  }
}
