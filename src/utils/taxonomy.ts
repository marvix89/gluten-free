import type { Category } from '@/types';

export interface MappedTaxonomyResult {
  categoryId: Category;
  categoryLabel: string;
  emoji: string;
  confidence: number;
  matchedTag: string;
  suggestedTags: string[];
}

/**
 * Mappatura tra parole chiave / tag in inglese di ImageNet/MobileNet
 * e le categorie ufficiali del database Gluten Free.
 */
const MOBILENET_TO_DATABASE_MAP: Record<string, { categoryId: Category; label: string; emoji: string }> = {
  // Gelati
  'ice cream': { categoryId: 'gelati', label: 'Gelati', emoji: '🍦' },
  'ice lolly': { categoryId: 'gelati', label: 'Gelati', emoji: '🍦' },
  'sorbet': { categoryId: 'gelati', label: 'Gelati', emoji: '🍦' },

  // Formaggi & Spalmabili
  'cheese': { categoryId: 'formaggi', label: 'Formaggi & Spalmabili', emoji: '🧀' },
  'butter': { categoryId: 'formaggi', label: 'Formaggi & Spalmabili', emoji: '🧀' },
  'cream': { categoryId: 'formaggi', label: 'Formaggi & Spalmabili', emoji: '🧀' },

  // Yogurt & Dessert
  'yogurt': { categoryId: 'yogurt-dessert', label: 'Yogurt & Dessert', emoji: '🫙' },
  'yoghurt': { categoryId: 'yogurt-dessert', label: 'Yogurt & Dessert', emoji: '🫙' },
  'pudding': { categoryId: 'yogurt-dessert', label: 'Yogurt & Dessert', emoji: '🫙' },
  'trifle': { categoryId: 'yogurt-dessert', label: 'Yogurt & Dessert', emoji: '🫙' },
  'custard': { categoryId: 'yogurt-dessert', label: 'Yogurt & Dessert', emoji: '🫙' },

  // Alternative Vegetali & Bevande
  'soy milk': { categoryId: 'alternative-vegetali', label: 'Alternative Vegetali', emoji: '🥛' },
  'almond milk': { categoryId: 'alternative-vegetali', label: 'Alternative Vegetali', emoji: '🥛' },
  'oat milk': { categoryId: 'alternative-vegetali', label: 'Alternative Vegetali', emoji: '🥛' },
  'milk': { categoryId: 'alternative-vegetali', label: 'Alternative Vegetali', emoji: '🥛' },
  'espresso': { categoryId: 'alternative-vegetali', label: 'Alternative Vegetali', emoji: '☕' },
  'cup': { categoryId: 'alternative-vegetali', label: 'Alternative Vegetali', emoji: '🥛' },
  'coffee mug': { categoryId: 'alternative-vegetali', label: 'Alternative Vegetali', emoji: '☕' },
  'water bottle': { categoryId: 'alternative-vegetali', label: 'Alternative Vegetali', emoji: '🥤' },

  // Dolci & Biscotti
  'pretzel': { categoryId: 'dolci-biscotti', label: 'Dolci & Biscotti', emoji: '🥨' },
  'bagel': { categoryId: 'dolci-biscotti', label: 'Dolci & Biscotti', emoji: '🍩' },
  'bakery': { categoryId: 'dolci-biscotti', label: 'Dolci & Biscotti', emoji: '🥐' },
  'dough': { categoryId: 'dolci-biscotti', label: 'Dolci & Biscotti', emoji: '🍪' },
  'chocolate sauce': { categoryId: 'dolci-biscotti', label: 'Dolci & Biscotti', emoji: '🍫' },
  'confectionery': { categoryId: 'dolci-biscotti', label: 'Dolci & Biscotti', emoji: '🍬' },
  'strawberry': { categoryId: 'dolci-biscotti', label: 'Dolci & Biscotti', emoji: '🍓' },
  'banana': { categoryId: 'dolci-biscotti', label: 'Dolci & Biscotti', emoji: '🍌' },

  // Piatti Pronti
  'cheeseburger': { categoryId: 'piatti-pronti', label: 'Piatti Pronti', emoji: '🍔' },
  'hotdog': { categoryId: 'piatti-pronti', label: 'Piatti Pronti', emoji: '🌭' },
  'pizza': { categoryId: 'piatti-pronti', label: 'Piatti Pronti', emoji: '🍕' },
  'burrito': { categoryId: 'piatti-pronti', label: 'Piatti Pronti', emoji: '🌯' },
  'taco': { categoryId: 'piatti-pronti', label: 'Piatti Pronti', emoji: '🌮' },
  'spaghetti squash': { categoryId: 'piatti-pronti', label: 'Piatti Pronti', emoji: '🍝' },
  'carbonara': { categoryId: 'piatti-pronti', label: 'Piatti Pronti', emoji: '🍝' },
  'potpie': { categoryId: 'piatti-pronti', label: 'Piatti Pronti', emoji: '🥧' },
  'meat loaf': { categoryId: 'piatti-pronti', label: 'Piatti Pronti', emoji: '🥩' },
  'mashed potato': { categoryId: 'piatti-pronti', label: 'Piatti Pronti', emoji: '🥔' },
  'soup bowl': { categoryId: 'piatti-pronti', label: 'Piatti Pronti', emoji: '🍲' },
  'consomme': { categoryId: 'piatti-pronti', label: 'Piatti Pronti', emoji: '🍲' },

  // Prodotti Generici / Packaging
  'packet': { categoryId: 'personalizzato', label: 'Prodotto Confezionato', emoji: '📦' },
  'carton': { categoryId: 'alternative-vegetali', label: 'Alternative Vegetali', emoji: '🥛' },
  'can': { categoryId: 'personalizzato', label: 'Personalizzato', emoji: '🥫' },
  'bottle': { categoryId: 'personalizzato', label: 'Personalizzato', emoji: '🍾' },
  'grocery store': { categoryId: 'personalizzato', label: 'Alimentari', emoji: '🛒' },
};

/**
 * Funzione autonoma di classificazione e associazione tassonomica.
 * Isolata in modo da poter essere sostituita in futuro da modelli vision avanzati (es. Llama 3.2 Vision / GPT-4o).
 *
 * @param aiPredictions Array di previsioni dal modello AI es. [{ label: 'ice cream, gelato', score: 0.85 }, ...]
 */
export function classifyAndMapCategory(
  aiPredictions: Array<{ label: string; score: number }>
): MappedTaxonomyResult {
  if (!aiPredictions || aiPredictions.length === 0) {
    return {
      categoryId: 'personalizzato',
      categoryLabel: 'Personalizzato',
      emoji: '⭐',
      confidence: 0,
      matchedTag: 'sconosciuto',
      suggestedTags: [],
    };
  }

  // Estraiamo tutti i singoli tag/keywords puliti
  const suggestedTags: string[] = [];
  aiPredictions.forEach((pred) => {
    pred.label.split(',').forEach((part) => {
      const clean = part.trim().toLowerCase();
      if (clean && !suggestedTags.includes(clean)) {
        suggestedTags.push(clean);
      }
    });
  });

  // Cerchiamo una corrispondenza nei tag ad alta probabilità
  for (const pred of aiPredictions) {
    const subLabels = pred.label.split(',').map((l) => l.trim().toLowerCase());
    for (const sub of subLabels) {
      if (MOBILENET_TO_DATABASE_MAP[sub]) {
        const match = MOBILENET_TO_DATABASE_MAP[sub];
        return {
          categoryId: match.categoryId,
          categoryLabel: match.label,
          emoji: match.emoji,
          confidence: pred.score,
          matchedTag: sub,
          suggestedTags: suggestedTags.slice(0, 5),
        };
      }
      // Ricerca parziale per sottostringhe
      for (const [key, val] of Object.entries(MOBILENET_TO_DATABASE_MAP)) {
        if (sub.includes(key) || key.includes(sub)) {
          return {
            categoryId: val.categoryId,
            categoryLabel: val.label,
            emoji: val.emoji,
            confidence: pred.score,
            matchedTag: key,
            suggestedTags: suggestedTags.slice(0, 5),
          };
        }
      }
    }
  }

  // Fallback se nessun tag corrisponde esattamente
  const topTag = suggestedTags[0] || 'prodotto';
  return {
    categoryId: 'personalizzato',
    categoryLabel: 'Personalizzato',
    emoji: '⭐',
    confidence: aiPredictions[0]?.score || 0,
    matchedTag: topTag,
    suggestedTags: suggestedTags.slice(0, 5),
  };
}

export const ZERO_SHOT_FOOD_CANDIDATES = [
  { id: 'formaggi' as Category, label: 'a photo of cheese packaging, ricotta tub, mozzarella cup, dairy cheese product', emoji: '🧀', display: 'Formaggi & Spalmabili', color: '#d97706' },
  { id: 'yogurt-dessert' as Category, label: 'a photo of yogurt cup, fruit dessert tub, pudding pot, dairy free yogurt cup', emoji: '🫙', display: 'Yogurt & Dessert', color: '#16a34a' },
  { id: 'alternative-vegetali' as Category, label: 'a photo of plant milk carton, soy milk bottle, oat milk container, dairy free drink', emoji: '🥛', display: 'Alternative Vegetali', color: '#7c3aed' },
  { id: 'gelati' as Category, label: 'a photo of ice cream tub, gelato box, ice lolly popsicle, frozen dessert', emoji: '🍦', display: 'Gelati', color: '#0891b2' },
  { id: 'dolci-biscotti' as Category, label: 'a photo of cookies package, sweet biscuits bag, cake box, bakery snacks', emoji: '🍪', display: 'Dolci & Biscotti', color: '#be185d' },
  { id: 'salumi-carni' as Category, label: 'a photo of sliced meat package, cold cuts ham tray, sausages pack, plant meat', emoji: '🥓', display: 'Salumi & Carni', color: '#dc2626' },
  { id: 'pane-lievitati' as Category, label: 'a photo of sliced bread loaf, crackers package, breadsticks box, flatbread bag', emoji: '🍞', display: 'Pane & Lievitati', color: '#d97706' },
  { id: 'pasta-cereali' as Category, label: 'a photo of dry pasta bag, rice package, breakfast cereal box, oats packet', emoji: '🍝', display: 'Pasta & Cereali', color: '#ca8a04' },
  { id: 'piatti-pronti' as Category, label: 'a photo of frozen pizza box, ready meal tray, veggie burger box, prepared food', emoji: '🍳', display: 'Piatti Pronti', color: '#b45309' },
  { id: 'condimenti-salse' as Category, label: 'a photo of olive oil glass bottle, tomato sauce jar, mayonnaise tube, condiment', emoji: '🫒', display: 'Condimenti & Salse', color: '#65a30d' },
];

export function mapZeroShotPrediction(predictions: Array<{ label: string; score: number }>) {
  return fuseVisionAndText(predictions, '');
}

export function fuseVisionAndText(
  predictions: Array<{ label: string; score: number }>,
  textContext?: string,
  ruleCategoryId?: string
) {
  if (!predictions || !Array.isArray(predictions) || predictions.length === 0) return null;

  const cleanText = (textContext || '').toLowerCase();

  const scoredCandidates = ZERO_SHOT_FOOD_CANDIDATES.map(cand => {
    const rawPred = predictions.find(p => p.label === cand.label);
    const visionScore = rawPred && typeof rawPred.score === 'number' ? rawPred.score : 0;
    
    let textBoost = 0;

    if (ruleCategoryId && ruleCategoryId === cand.id && ruleCategoryId !== 'personalizzato') {
      textBoost += 0.35;
    }

    if (cand.id === 'yogurt-dessert' && /yogurt|yoghurt|kefir|bifidus|budino|dessert|zymil|fermentato|pudding|mousse|merano|sojasun|activia|bella vita|mirtill|fragol|banana|vaniglia/i.test(cleanText)) {
      textBoost += 0.25;
    }
    if (cand.id === 'formaggi' && /formaggio|cheese|caciot|mozzarell|burr|ricott|stracchino|crescenza|robiola|spalmabile|sottilette|grattugiato|mascarpone|provola|scamorza|gorgonzola|fiocchi|fettine|violife|vemondo|philadelphia|burrata|tomino|edam|gouda|emmental|pecorino|grana|parmigiano|vallelata|galbani/i.test(cleanText)) {
      textBoost += 0.25;
    }
    if (cand.id === 'alternative-vegetali' && /bevanda.*soia|bevanda.*riso|bevanda.*avena|bevanda.*mandorla|bevanda.*cocco|latte|soya|soia drink|oat drink|almond drink|rice drink|alpro|valsoia/i.test(cleanText)) {
      textBoost += 0.25;
    }
    if (cand.id === 'gelati' && /gelato|ice cream|sorbetto|cremeria|magnum|cucciolone|stecco|tartufo|granita|cono/i.test(cleanText)) {
      textBoost += 0.25;
    }
    if (cand.id === 'dolci-biscotti' && /biscott|frollin|cookie|biscuit|wafer|cake|torta|crostata|muffin|madeleine|cornett|brioche|merenda|cioccolat|cacao|brownie|panettone|pandoro|mulino bianco/i.test(cleanText)) {
      textBoost += 0.25;
    }
    if (cand.id === 'salumi-carni' && /prosciutt|salum|mortadell|pancett|speck|wurstel|wrustel|carn|bresaol|pollo|tacchino|suino|manzo|vitello|salam|affettat|bacon/i.test(cleanText)) {
      textBoost += 0.25;
    }
    if (cand.id === 'pane-lievitati' && /pane|panino|panbauletto|panfette|grissin|cracker|piadin|focacc|lievitat|tarall|baguette|toast|rosetta|schiacciata/i.test(cleanText)) {
      textBoost += 0.25;
    }
    if (cand.id === 'pasta-cereali' && /past|spaghett|penn|fusill|maccheron|gnocch|riso|farro|orzo|granola|muesli|cereali|fiocchi/i.test(cleanText)) {
      textBoost += 0.25;
    }
    if (cand.id === 'piatti-pronti' && /burger|pizza|lasagna|ravioli|tortellini|zuppa|soup|cotoletta|nugget|piatto pronto|meal|risotto/i.test(cleanText)) {
      textBoost += 0.25;
    }
    if (cand.id === 'condimenti-salse' && /olio|aceto|sals|maiones|ket|senap|pesto|spezi|condiment|dado|brodo/i.test(cleanText)) {
      textBoost += 0.25;
    }

    const finalScore = visionScore + textBoost;
    return {
      cand,
      visionScore,
      textBoost,
      finalScore
    };
  });

  scoredCandidates.sort((a, b) => b.finalScore - a.finalScore);
  const top = scoredCandidates[0];

  if (!top || top.finalScore < 0.10) return null;

  return {
    categoryId: top.cand.id,
    categoryLabel: top.cand.display,
    emoji: top.cand.emoji,
    color: top.cand.color,
    confidence: Math.min(Math.round(top.finalScore * 100), 99) / 100,
    topPredictions: scoredCandidates.slice(0, 3).map(item => ({
      label: item.cand.display,
      score: Math.min(Math.round(item.finalScore * 100), 99) / 100
    }))
  };
}
