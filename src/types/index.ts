import type { ProductEnrichmentData } from '../lib/product-enrichment';

export type Category = string;

export interface CategoryItem {
  id: string;
  label: string;
  emoji: string;
  color: string;
  count?: number;
}

export interface Product {
  id: string;
  name: string;
  category: Category;
  categoryLabel?: string;
  categoryColor?: string;
  description: string;
  emoji: string;
  tags: string[];
  isCustom?: boolean;
  isGlutenFree: boolean;
  glutenLevel?: 'none' | 'trace' | 'low';
  enrichment?: ProductEnrichmentData;
}

export interface CustomProduct extends Product {
  isCustom: true;
  addedAt: string;
}

export type View = 'catalog' | 'favorites' | 'add';
