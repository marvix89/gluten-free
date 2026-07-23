import { IProductEnrichmentProvider, ProductEnrichmentData, PaginatedResult } from '../types';
import type { Product, Category } from '../../../types';

export class OpenFoodFactsProvider implements IProductEnrichmentProvider {
  private readonly baseUrl = 'https://world.openfoodfacts.org/api/v2';
  
  // Richiesto dalle guidelines OFF per uso responsabile
  private readonly headers = {
    'User-Agent': 'gluten-free-app/1.0 - Web Application - https://github.com/marvix89/gluten-free'
  };

  async fetchByBarcode(barcode: string): Promise<ProductEnrichmentData | null> {
    try {
      const fields = [
        'product_name',
        'brands',
        'image_url',
        'image_front_small_url',
        'nutriscore_grade',
        'nova_group',
        'ecoscore_grade',
        'allergens_tags',
        'ingredients_text',
        'nutriments',
        'nutriments_estimated',
        'labels_tags',
        'quantity'
      ].join(',');

      const url = `${this.baseUrl}/product/${barcode}.json?fields=${fields}`;
      
      const MAX_RETRIES = 3;
      let response: Response | null = null;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
          response = await fetch(url, { headers: this.headers, signal: controller.signal });
          clearTimeout(timeoutId);

          if (response.ok || ![429, 502, 503, 504].includes(response.status)) break;

          const waitMs = Math.pow(2, attempt - 1) * 1500; // 1.5s, 3s, 6s
          console.warn(`OFF API returned ${response.status} for barcode ${barcode}, retry ${attempt}/${MAX_RETRIES} in ${waitMs}ms`);
          await new Promise(r => setTimeout(r, waitMs));
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          lastError = fetchErr as Error;
          if (attempt === MAX_RETRIES) throw lastError;
          const waitMs = Math.pow(2, attempt - 1) * 1500;
          console.warn(`OFF API fetch error for barcode ${barcode}, retry ${attempt}/${MAX_RETRIES} in ${waitMs}ms:`, fetchErr);
          await new Promise(r => setTimeout(r, waitMs));
        }
      }

      if (!response || !response.ok) {
        if (response?.status === 404) return null;
        throw new Error(`OpenFoodFacts API error: ${response?.status ?? 'no response'}`);
      }

      const data = await response.json();
      
      if (data.status !== 1 || !data.product) {
        return null;
      }

      const p = data.product;

      const enrichmentData: ProductEnrichmentData = {
        brand: p.brands,
        quantity: p.quantity,
        imageUrl: p.image_url,
        imageThumbnailUrl: p.image_front_small_url,
        ingredientsText: p.ingredients_text,
        allergens: p.allergens_tags,
        labels: p.labels_tags,
        
        // Scores
        nutriScore: p.nutriscore_grade?.toLowerCase() as ProductEnrichmentData['nutriScore'],
        novaGroup: p.nova_group as ProductEnrichmentData['novaGroup'],
        ecoScore: p.ecoscore_grade?.toLowerCase() as ProductEnrichmentData['ecoScore'],
        
        // Nutriments
        glutenEstimated100g: p.nutriments_estimated?.gluten_100g,
      };

      // Map standard nutriments if available
      if (p.nutriments) {
        enrichmentData.nutriments = {
          kcal100g: p.nutriments['energy-kcal_100g'],
          proteins100g: p.nutriments.proteins_100g,
          fat100g: p.nutriments.fat_100g,
          carbs100g: p.nutriments.carbohydrates_100g,
          sugars100g: p.nutriments.sugars_100g,
        };
      }

      // Rimuovi campi undefined per pulizia
      Object.keys(enrichmentData).forEach(key => {
        if (enrichmentData[key as keyof ProductEnrichmentData] === undefined) {
          delete enrichmentData[key as keyof ProductEnrichmentData];
        }
      });

      return enrichmentData;
      
    } catch (error) {
      console.error(`Error fetching from OpenFoodFacts for barcode ${barcode}:`, error);
      return null;
    }
  }

  private getDynamicCategoryStyle(slug: string): { emoji: string; color: string } {
    if (/carn|salum|prosciutt|mortadell|speck|wrustel|pollo|bovino|maiale/.test(slug)) return { emoji: '🥩', color: '#dc2626' };
    if (/pesc|tonn|salmon|merluzz|crostace|mollusc|gamber/.test(slug)) return { emoji: '🐟', color: '#0284c7' };
    if (/past|spaghett|maccheron|tortellin|raviol|gnocch|riso|cereali/.test(slug)) return { emoji: '🍝', color: '#ca8a04' };
    if (/pan|lievitat|focacc|grissin|cracker|piadin|panin|fette/.test(slug)) return { emoji: '🍞', color: '#d97706' };
    if (/verd|ortagg|insalat|pomodor|patat|legum|fagiol|lenticch|ceci/.test(slug)) return { emoji: '🥗', color: '#16a34a' };
    if (/frutt|mel|banan|agrum|succ|marmellat|confettur/.test(slug)) return { emoji: '🍎', color: '#ea580c' };
    if (/olio|condiment|sals|maiones|ket|senap|dad|spezie|brodo/.test(slug)) return { emoji: '🫒', color: '#65a30d' };
    if (/snack|patatin|popcorn|salat/.test(slug)) return { emoji: '🥨', color: '#b45309' };
    if (/bevand|acq|bibit|tè|caffè|infus|birr|vino/.test(slug)) return { emoji: '🥤', color: '#0891b2' };
    return { emoji: '🏷️', color: '#6366f1' };
  }

  public categorizeProduct(p: any): { id: string; label: string; emoji: string; color: string; level?: number; confidence?: number; method?: string } {
    const tagsArr = Array.isArray(p.categories_tags) ? p.categories_tags : (Array.isArray(p.tags) ? p.tags : []);
    const offTags = tagsArr.map((t: string) => typeof t === 'string' ? t.toLowerCase() : '');
    const name = [
      p.product_name_it,
      p.product_name,
      p.name_enc,
      p.name,
      p.description_enc
    ].filter(Boolean).join(' ').toLowerCase();

    // LIVELLO 1: Mapping Tassonomico Diretto da Tag Ufficiali OpenFoodFacts
    if (offTags.some((t: string) => t.includes('cheese') || t.includes('formagg') || t.includes('ricott') || t.includes('mozzarell') || t.includes('cream-cheeses'))) {
      return { id: 'formaggi', label: 'Formaggi & Spalmabili', emoji: '🧀', color: '#d97706', level: 1, confidence: 1.0, method: 'Tassonomia Ufficiale OFF (EAN Tags)' };
    }
    if (offTags.some((t: string) => t.includes('yogurt') || t.includes('plant-yogurt') || t.includes('fermented-milk') || t.includes('pudding') || t.includes('budin'))) {
      return { id: 'yogurt-dessert', label: 'Yogurt & Dessert', emoji: '🫙', color: '#16a34a', level: 1, confidence: 1.0, method: 'Tassonomia Ufficiale OFF (EAN Tags)' };
    }
    if (offTags.some((t: string) => t.includes('plant-milk') || t.includes('plant-based-beverage') || t.includes('milk-substitute') || t.includes('soy-milk') || t.includes('oat-milk') || t.includes('almond-milk'))) {
      return { id: 'alternative-vegetali', label: 'Alternative Vegetali', emoji: '🥛', color: '#7c3aed', level: 1, confidence: 1.0, method: 'Tassonomia Ufficiale OFF (EAN Tags)' };
    }
    if (offTags.some((t: string) => t.includes('ice-cream') || t.includes('sorbet') || t.includes('gelat'))) {
      return { id: 'gelati', label: 'Gelati', emoji: '🍦', color: '#0891b2', level: 1, confidence: 1.0, method: 'Tassonomia Ufficiale OFF (EAN Tags)' };
    }
    if (offTags.some((t: string) => t.includes('biscuit') || t.includes('cookie') || t.includes('cake') || t.includes('pastries') || t.includes('sweet-snack') || t.includes('biscott'))) {
      return { id: 'dolci-biscotti', label: 'Dolci & Biscotti', emoji: '🍪', color: '#be185d', level: 1, confidence: 1.0, method: 'Tassonomia Ufficiale OFF (EAN Tags)' };
    }
    if (offTags.some((t: string) => t.includes('meat') || t.includes('cold-cut') || t.includes('ham') || t.includes('sausage') || t.includes('salum') || t.includes('affettat'))) {
      return { id: 'salumi-carni', label: 'Salumi & Carni', emoji: '🥓', color: '#dc2626', level: 1, confidence: 1.0, method: 'Tassonomia Ufficiale OFF (EAN Tags)' };
    }
    if (offTags.some((t: string) => t.includes('bread') || t.includes('flatbread') || t.includes('rusk') || t.includes('cracker') || t.includes('lievitat'))) {
      return { id: 'pane-lievitati', label: 'Pane & Lievitati', emoji: '🍞', color: '#d97706', level: 1, confidence: 1.0, method: 'Tassonomia Ufficiale OFF (EAN Tags)' };
    }
    if (offTags.some((t: string) => t.includes('pasta') || t.includes('cereal') || t.includes('rice') || t.includes('spaghetti'))) {
      return { id: 'pasta-cereali', label: 'Pasta & Cereali', emoji: '🍝', color: '#ca8a04', level: 1, confidence: 1.0, method: 'Tassonomia Ufficiale OFF (EAN Tags)' };
    }
    if (offTags.some((t: string) => t.includes('ready-meal') || t.includes('pizza') || t.includes('burger') || t.includes('piatt'))) {
      return { id: 'piatti-pronti', label: 'Piatti Pronti', emoji: '🍳', color: '#b45309', level: 1, confidence: 1.0, method: 'Tassonomia Ufficiale OFF (EAN Tags)' };
    }
    if (offTags.some((t: string) => t.includes('condiment') || t.includes('sauce') || t.includes('oil') || t.includes('mayonnaise'))) {
      return { id: 'condimenti-salse', label: 'Condimenti & Salse', emoji: '🫒', color: '#65a30d', level: 1, confidence: 1.0, method: 'Tassonomia Ufficiale OFF (EAN Tags)' };
    }

    // LIVELLO 2: Motore Matematico di Scoring Matrix Pesato
    const fullText = [name, offTags.join(' ')].join(' ');

    const scores: Record<string, { points: number; label: string; emoji: string; color: string }> = {
      'formaggi': { points: 0, label: 'Formaggi & Spalmabili', emoji: '🧀', color: '#d97706' },
      'yogurt-dessert': { points: 0, label: 'Yogurt & Dessert', emoji: '🫙', color: '#16a34a' },
      'alternative-vegetali': { points: 0, label: 'Alternative Vegetali', emoji: '🥛', color: '#7c3aed' },
      'gelati': { points: 0, label: 'Gelati', emoji: '🍦', color: '#0891b2' },
      'dolci-biscotti': { points: 0, label: 'Dolci & Biscotti', emoji: '🍪', color: '#be185d' },
      'salumi-carni': { points: 0, label: 'Salumi & Carni', emoji: '🥓', color: '#dc2626' },
      'pane-lievitati': { points: 0, label: 'Pane & Lievitati', emoji: '🍞', color: '#d97706' },
      'pasta-cereali': { points: 0, label: 'Pasta & Cereali', emoji: '🍝', color: '#ca8a04' },
      'piatti-pronti': { points: 0, label: 'Piatti Pronti', emoji: '🍳', color: '#b45309' },
      'condimenti-salse': { points: 0, label: 'Condimenti & Salse', emoji: '🫒', color: '#65a30d' },
      'bevande': { points: 0, label: 'Bevande', emoji: '🥤', color: '#0891b2' },
    };

    // Ponderazione Token e Keyword
    if (/formaggio|cheese|caciot|mozzarell|burr|ricott|stracchino|crescenza|robiola|spalmabile|sottilette|grattugiato|mascarpone|provola|scamorza|gorgonzola|fiocchi|fettine|fuso|violife|vemondo|philadelphia|burrata|tomino|edam|gouda|emmental|pecorino|grana|parmigiano|vallelata|galbani/i.test(fullText)) scores['formaggi'].points += 8;
    if (/caciot|ricott|mozzarell|burrat|stracchin/i.test(fullText)) scores['formaggi'].points += 5;

    if (/yogurt|kefir|bifidus|budino|dessert|zymil|fermentato|pudding|mousse|merano|sojasun|activia|bella vita|cremoso/i.test(fullText)) scores['yogurt-dessert'].points += 8;
    if (/mirtill|fragol|vaniglia|frutta/i.test(fullText) && /soia|avena|valsoia|alpro/i.test(fullText)) scores['yogurt-dessert'].points += 4;

    if (/bevanda.*soia|bevanda.*riso|bevanda.*avena|bevanda.*mandorla|bevanda.*cocco|latte.*soia|latte.*riso|latte.*avena|latte.*mandorla|latte.*cocco|soya|soia drink|oat drink|almond drink|rice drink|panna vegetale|cuisine|soyadrink|latte/i.test(fullText)) scores['alternative-vegetali'].points += 8;
    if (/brick|cartone|litro/i.test(fullText) && /soia|avena|riso|mandorla/i.test(fullText)) scores['alternative-vegetali'].points += 4;

    if (/gelato|ice cream|sorbetto|cremeria|magnum|cucciolone|stecco|tartufo|granita|cono|sandwich/i.test(fullText)) scores['gelati'].points += 8;
    if (/biscott|frollin|cookie|biscuit|wafer|cake|torta|crostata|muffin|madeleine|cornett|brioche|merenda|cioccolat|cacao|brownie|panettone|pandoro|mulino bianco/i.test(fullText)) scores['dolci-biscotti'].points += 8;
    if (/prosciutt|salum|mortadell|pancett|speck|wurstel|wrustel|carn|bresaol|pollo|tacchino|suino|manzo|vitello|salam|affettat|bacon/i.test(fullText)) scores['salumi-carni'].points += 8;
    if (/pane|panino|panbauletto|panfette|grissin|cracker|piadin|focacc|lievitat|tarall|baguette|toast|rosetta|schiacciata/i.test(fullText)) scores['pane-lievitati'].points += 8;
    if (/past|spaghett|penn|fusill|maccheron|gnocch|riso|farro|orzo|granola|muesli|cereali|fiocchi/i.test(fullText)) scores['pasta-cereali'].points += 8;
    if (/burger|pizza|lasagna|ravioli|tortellini|zuppa|soup|cotoletta|nugget|piatto pronto|meal|risotto/i.test(fullText)) scores['piatti-pronti'].points += 8;
    if (/olio|aceto|sals|maiones|ket|senap|pesto|spezi|condiment|ajinomoto|dado|brodo/i.test(fullText)) scores['condimenti-salse'].points += 8;
    if (/acq|bibit|succ|thè|tè|infus|caffè|birr|vino|drink|bevanda|tisana/i.test(fullText)) scores['bevande'].points += 8;

    const ranked = Object.entries(scores)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.points - a.points);

    if (ranked[0].points >= 5) {
      const top = ranked[0];
      return { id: top.id, label: top.label, emoji: top.emoji, color: top.color, level: 2, confidence: 0.95, method: 'Motore Semantico a Punteggio (Scoring Matrix)' };
    }

    // LIVELLO 3: Categorie dinamiche da OFF/DB o Fallback su Analisi Visiva Locale
    if (p.categories) {
      const parts = p.categories.split(',').map((s: string) => s.trim()).filter(Boolean);
      const genericWords = ['plant-based', 'alimenti', 'cibi', 'beverages', 'foods', 'prodotti', 'en:'];
      const candidate = parts.find((part: string) => part.length <= 30 && !genericWords.some(w => part.toLowerCase().includes(w))) || parts[0];
      
      if (candidate) {
        const id = candidate.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (id && id.length > 1) {
          const label = candidate.charAt(0).toUpperCase() + candidate.slice(1);
          const style = this.getDynamicCategoryStyle(id);
          return { id, label, emoji: style.emoji, color: style.color, level: 3, confidence: 0.60, method: 'Tag Dinamico OFF/DB' };
        }
      }
    }

    return { id: 'personalizzato', label: 'Personalizzato', emoji: '⭐', color: '#f59e0b', level: 3, confidence: 0.15, method: 'Richiesta Analisi Visiva Fallback' };
  }

  async searchProducts(query: string, locale: string, page: number = 1, pageSize: number = 25): Promise<PaginatedResult<Product>> {
    try {
      const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
      if (query) {
        url.searchParams.append('search_terms', query);
      }
      url.searchParams.append('search_simple', '1');
      url.searchParams.append('action', 'process');
      url.searchParams.append('json', '1');
      url.searchParams.append('page', page.toString());
      url.searchParams.append('page_size', pageSize.toString());
      url.searchParams.append('lc', locale);
      
      // Filtra solo prodotti senza glutine (usiamo il label positivo per evitare timeout dell'API)
      url.searchParams.append('tagtype_0', 'labels');
      url.searchParams.append('tag_contains_0', 'contains');
      url.searchParams.append('tag_0', 'en:no-gluten');
      
      // Filtra solo prodotti disponibili in Italia
      url.searchParams.append('tagtype_1', 'countries');
      url.searchParams.append('tag_contains_1', 'contains');
      url.searchParams.append('tag_1', 'en:italy');
      
      const fields = [
        'code',
        'product_name',
        'product_name_it',
        'brands',
        'image_url',
        'image_front_small_url',
        'nutriscore_grade',
        'nova_group',
        'ecoscore_grade',
        'allergens_tags',
        'ingredients_text',
        'ingredients_text_it',
        'labels_tags',
        'categories',
        'categories_tags',
        'quantity'
      ].join(',');
      url.searchParams.append('fields', fields);

      // Retry con backoff esponenziale per errori temporanei (503, 429, 502)
      const MAX_RETRIES = 3;
      let response: Response | null = null;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
          response = await fetch(url.toString(), { headers: this.headers, signal: controller.signal });
          clearTimeout(timeoutId);

          // Successo o errore non recuperabile → esci dal loop
          if (response.ok || ![429, 502, 503, 504].includes(response.status)) break;

          // Errore recuperabile → attendi e riprova
          const waitMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
          console.warn(`OFF API returned ${response.status}, retry ${attempt}/${MAX_RETRIES} in ${waitMs}ms`);
          await new Promise(r => setTimeout(r, waitMs));
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          lastError = fetchErr as Error;
          if (attempt === MAX_RETRIES) throw lastError;
          const waitMs = Math.pow(2, attempt - 1) * 1000;
          console.warn(`OFF API fetch error, retry ${attempt}/${MAX_RETRIES} in ${waitMs}ms:`, fetchErr);
          await new Promise(r => setTimeout(r, waitMs));
        }
      }

      if (!response || !response.ok) {
        throw new Error(`OpenFoodFacts Search API error: ${response?.status ?? 'no response'}`);
      }

      const data = await response.json();
      const count = data.count || 0;
      const returnedProducts = data.products || [];

      const mappedProducts: Product[] = returnedProducts.map((p: any) => {
        // Determinare gluten free basandosi su label o allergeni (approssimativo)
        const hasGluten = p.allergens_tags?.includes('en:gluten');
        const isGlutenFree = p.labels_tags?.includes('en:no-gluten') || p.labels_tags?.includes('en:gluten-free');

        // Usa i campi localizzati se disponibili, altrimenti fallback ai generici
        const name = p.product_name_it || p.product_name || p.brands || 'Prodotto Sconosciuto';
        const description = p.ingredients_text_it || p.ingredients_text || '';
        const catInfo = this.categorizeProduct(p);

        return {
          id: p.code,
          name: name,
          description: description,
          category: catInfo.id,
          categoryLabel: catInfo.label,
          categoryColor: catInfo.color,
          emoji: catInfo.emoji,
          tags: p.labels_tags || [],
          isGlutenFree: isGlutenFree || !hasGluten,
          glutenLevel: (isGlutenFree || !hasGluten) ? 'none' : 'trace',
          enrichment: {
            brand: p.brands,
            quantity: p.quantity,
            imageUrl: p.image_url,
            imageThumbnailUrl: p.image_front_small_url,
            ingredientsText: description,
            allergens: p.allergens_tags,
            labels: p.labels_tags,
            nutriScore: p.nutriscore_grade?.toLowerCase() as ProductEnrichmentData['nutriScore'],
            novaGroup: p.nova_group as ProductEnrichmentData['novaGroup'],
            ecoScore: p.ecoscore_grade?.toLowerCase() as ProductEnrichmentData['ecoScore'],
          }
        };
      });

      return {
        products: mappedProducts,
        count: count,
        page: parseInt(data.page) || page,
        pageCount: Math.ceil(count / pageSize),
        pageSize: parseInt(data.page_size) || pageSize
      };
      
    } catch (error) {
      console.error(`Error searching OpenFoodFacts for query "${query}":`, error);
      throw error;
    }
  }
}
