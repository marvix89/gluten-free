import { v2 as cloudinary } from 'cloudinary';

/**
 * Client Cloudinary configurato con le variabili d'ambiente.
 * Singleton: viene inizializzato una sola volta al primo import.
 */
/**
 * Inizializza o aggiorna dinamicamente la configurazione di Cloudinary
 * estraendo le chiavi da CLOUDINARY_CLOUD_NAME, NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
 * o dalla stringa di connessione CLOUDINARY_URL.
 *
 * Essenziale in ambienti serverless (es. Vercel / Next.js chunks) dove lo stato
 * del singleton potrebbe andare perso o non essere inizializzato.
 */
export function ensureCloudinaryConfig() {
  let cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  let apiKey = process.env.CLOUDINARY_API_KEY;
  let apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (process.env.CLOUDINARY_URL) {
    try {
      // Formato: cloudinary://api_key:api_secret@cloud_name
      const cleanUrl = process.env.CLOUDINARY_URL.replace(/^cloudinary:\/\//, '');
      const [authPart, hostPart] = cleanUrl.split('@');
      if (hostPart) {
        if (!cloudName) cloudName = hostPart;
        if (authPart && authPart.includes(':')) {
          const [key, secret] = authPart.split(':');
          if (!apiKey) apiKey = key;
          if (!apiSecret) apiSecret = secret;
        }
      } else if (cleanUrl && !cleanUrl.includes('@')) {
        // Se CLOUDINARY_URL contiene solo il cloud_name o un hostname
        if (!cloudName) cloudName = cleanUrl;
      }
    } catch {
      // Ignora errori di parsing CLOUDINARY_URL
    }
  }

  const currentConfig = cloudinary.config();
  const finalCloudName = cloudName || currentConfig.cloud_name || 'dopewx3cu';
  const finalApiKey = apiKey || currentConfig.api_key;
  const finalApiSecret = apiSecret || currentConfig.api_secret;

  if (finalCloudName || finalApiKey || finalApiSecret) {
    cloudinary.config({
      cloud_name: finalCloudName,
      api_key: finalApiKey,
      api_secret: finalApiSecret,
      secure: true, // usa sempre HTTPS
    });
  }

  return {
    cloudName: finalCloudName,
    apiKey: finalApiKey,
    apiSecret: finalApiSecret,
  };
}

// Inizializzazione iniziale del singleton
ensureCloudinaryConfig();

export default cloudinary;

/**
 * Costruisce l'URL CDN di Cloudinary per un'immagine prodotto.
 * Applica trasformazioni automatiche: formato ottimale (WebP su browser moderni)
 * e qualità automatica per ridurre il peso senza perdita percepibile.
 *
 * @param publicId — es. "gluten-free/products/8051406012656"
 */
export function buildCloudinaryUrl(publicId?: string | null, options?: { width?: number; height?: number }): string | undefined {
  if (!publicId || publicId === 'none' || publicId === 'not_available') return undefined;

  try {
    const { cloudName } = ensureCloudinaryConfig();
    if (!cloudName) {
      // Se cloud_name non è presente, restituiamo undefined invece di lanciare un'eccezione,
      // per evitare che le API GET /api/products e /api/favorites vadano in errore 500 su Vercel.
      return undefined;
    }

    return cloudinary.url(publicId, {
      cloud_name: cloudName,
      fetch_format: 'auto',  // WebP/AVIF automatico
      quality: 'auto',       // qualità ottimale automatica
      crop: 'limit',
      width: options?.width || 1200,
      height: options?.height || 1200,
      secure: true,
    });
  } catch (err) {
    console.warn(`[Cloudinary] Errore nella generazione dell'URL per "${publicId}":`, err);
    return undefined;
  }
}

/**
 * Restituisce il public_id standard per un prodotto dato il suo ID.
 * Formato: "gluten-free/products/{productId}"
 */
export function getProductPublicId(productId: string): string {
  return `gluten-free/products/${productId}`;
}
