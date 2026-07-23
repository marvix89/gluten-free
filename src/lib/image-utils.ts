/**
 * Restituisce l'URL proxy sicuro per servire immagini prodotto via backend.
 * Formato: /api/images/<productId>
 * Il backend reindirizza il client alla CDN Cloudinary.
 */
export function getProductImageProxyUrl(productId: string): string {
  return `/api/images/${productId}`;
}

/**
 * Verifica che un URL immagine sia valido e non provenga da OpenFoodFacts
 * (che non viene più usato direttamente — tutte le immagini passano per Cloudinary).
 * Usata come guard per URL legacy già presenti nel DB.
 */
export function getValidImageUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().includes('openfoodfacts.org')) return null;
  return trimmed;
}
