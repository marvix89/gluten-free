export interface ProductEnrichmentData {
  imageUrl?: string;
  imageThumbnailUrl?: string;
  nutriScore?: 'a' | 'b' | 'c' | 'd' | 'e';
  novaGroup?: 1 | 2 | 3 | 4;
  ecoScore?: 'a' | 'b' | 'c' | 'd' | 'e';
  allergens?: string[];
  ingredientsText?: string;
  glutenEstimated100g?: number;
  nutriments?: {
    kcal100g?: number;
    proteins100g?: number;
    fat100g?: number;
    carbs100g?: number;
    sugars100g?: number;
  };
  labels?: string[];
  brand?: string;
  quantity?: string;
}

export interface PaginatedResult<T> {
  products: T[];
  count: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

export interface IProductEnrichmentProvider {
  fetchByBarcode(barcode: string): Promise<ProductEnrichmentData | null>;
  fetchByName?(name: string, brand?: string): Promise<ProductEnrichmentData | null>;
  searchProducts?(query: string, locale: string, page?: number, pageSize?: number): Promise<PaginatedResult<any>>;
}
