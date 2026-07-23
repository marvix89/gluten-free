import { IProductEnrichmentProvider } from './types';
import { OpenFoodFactsProvider } from './providers/open-food-facts';

export * from './types';

export function getEnrichmentProvider(): IProductEnrichmentProvider {
  // In futuro, si potrebbe leggere un'env var: process.env.PRODUCT_ENRICHMENT_PROVIDER
  // per ritornare provider diversi (es. Edamam, stub per i test, ecc.)
  
  return new OpenFoodFactsProvider();
}
