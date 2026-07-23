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
  // Cereali Alternativi
  'quinoa': { categoryId: 'cereali-alternativi', label: 'Cereali Alternativi', emoji: '🌾' },
  'buckwheat': { categoryId: 'cereali-alternativi', label: 'Cereali Alternativi', emoji: '🌾' },
  'millet': { categoryId: 'cereali-alternativi', label: 'Cereali Alternativi', emoji: '🌾' },
  'corn': { categoryId: 'cereali-alternativi', label: 'Cereali Alternativi', emoji: '🌽' },

  // Pasta & Riso
  'pasta': { categoryId: 'pasta-riso', label: 'Pasta & Riso', emoji: '🍝' },
  'spaghetti': { categoryId: 'pasta-riso', label: 'Pasta & Riso', emoji: '🍝' },
  'macaroni': { categoryId: 'pasta-riso', label: 'Pasta & Riso', emoji: '🍝' },
  'rice': { categoryId: 'pasta-riso', label: 'Pasta & Riso', emoji: '🍚' },
  'risotto': { categoryId: 'pasta-riso', label: 'Pasta & Riso', emoji: '🍚' },

  // Pane & Prodotti da Forno
  'bread': { categoryId: 'pane-prodotti-da-forno', label: 'Pane & Prodotti da Forno', emoji: '🍞' },
  'baguette': { categoryId: 'pane-prodotti-da-forno', label: 'Pane & Prodotti da Forno', emoji: '🥖' },
  'toast': { categoryId: 'pane-prodotti-da-forno', label: 'Pane & Prodotti da Forno', emoji: '🍞' },
  'flatbread': { categoryId: 'pane-prodotti-da-forno', label: 'Pane & Prodotti da Forno', emoji: '🫓' },
  'focaccia': { categoryId: 'pane-prodotti-da-forno', label: 'Pane & Prodotti da Forno', emoji: '🍞' },

  // Dolci & Biscotti
  'cookie': { categoryId: 'dolci-biscotti', label: 'Dolci & Biscotti', emoji: '🍪' },
  'biscuit': { categoryId: 'dolci-biscotti', label: 'Dolci & Biscotti', emoji: '🍪' },
  'cake': { categoryId: 'dolci-biscotti', label: 'Dolci & Biscotti', emoji: '🍰' },
  'muffin': { categoryId: 'dolci-biscotti', label: 'Dolci & Biscotti', emoji: '🧁' },
  'pastry': { categoryId: 'dolci-biscotti', label: 'Dolci & Biscotti', emoji: '🥐' },

  // Piatti Pronti
  'pizza': { categoryId: 'piatti-pronti', label: 'Piatti Pronti', emoji: '🍕' },
  'lasagna': { categoryId: 'piatti-pronti', label: 'Piatti Pronti', emoji: '🍝' },
  'burger': { categoryId: 'piatti-pronti', label: 'Piatti Pronti', emoji: '🍔' },
  'ready meal': { categoryId: 'piatti-pronti', label: 'Piatti Pronti', emoji: '🍱' },

  // Snack Salati
  'pretzel': { categoryId: 'snack-salati', label: 'Snack Salati', emoji: '🥨' },
  'cracker': { categoryId: 'snack-salati', label: 'Snack Salati', emoji: '🍘' },
  'chips': { categoryId: 'snack-salati', label: 'Snack Salati', emoji: '🍟' },
  'snack': { categoryId: 'snack-salati', label: 'Snack Salati', emoji: '🍿' },

  // Prodotti Generici / Packaging
  'packet': { categoryId: 'personalizzato', label: 'Prodotto Confezionato', emoji: '📦' },
  'box': { categoryId: 'personalizzato', label: 'Prodotto in Scatola', emoji: '📦' },
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
  { id: 'cereali-alternativi' as Category, label: 'a photo of alternative grains, quinoa, buckwheat bag, corn, gluten free cereal', emoji: '🌾', display: 'Cereali Alternativi', color: '#7c3aed' },
  { id: 'pasta-riso' as Category, label: 'a photo of dry pasta bag, spaghetti, macaroni, rice package, gluten free pasta', emoji: '🍝', display: 'Pasta & Riso', color: '#d97706' },
  { id: 'pane-prodotti-da-forno' as Category, label: 'a photo of sliced bread loaf, bread rolls, baguette, gluten free bread, flatbread', emoji: '🍞', display: 'Pane & Prodotti da Forno', color: '#16a34a' },
  { id: 'dolci-biscotti' as Category, label: 'a photo of cookies package, sweet biscuits bag, cake box, bakery snacks, gluten free sweets', emoji: '🍪', display: 'Dolci & Biscotti', color: '#be185d' },
  { id: 'piatti-pronti' as Category, label: 'a photo of frozen pizza box, ready meal tray, lasagna, prepared food', emoji: '🍳', display: 'Piatti Pronti', color: '#0891b2' },
  { id: 'snack-salati' as Category, label: 'a photo of potato chips bag, crackers package, pretzels, savory snacks, breadsticks', emoji: '🥨', display: 'Snack Salati', color: '#b45309' },
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

    if (cand.id === 'cereali-alternativi' && /quinoa|grano saraceno|miglio|amaranto|mais|sorgo|teff|avena|cereali/i.test(cleanText)) {
      textBoost += 0.25;
    }
    if (cand.id === 'pasta-riso' && /pasta|spaghett|penn|fusill|maccheron|gnocch|riso|lasagne|noodle|tortellini|ravioli/i.test(cleanText)) {
      textBoost += 0.25;
    }
    if (cand.id === 'pane-prodotti-da-forno' && /pane|panino|panbauletto|panfette|baguette|rosetta|piadin|focacc|toast|schiacciata/i.test(cleanText)) {
      textBoost += 0.25;
    }
    if (cand.id === 'dolci-biscotti' && /biscott|frollin|cookie|biscuit|wafer|cake|torta|crostata|muffin|madeleine|cornett|brioche|merenda|cioccolat|panettone/i.test(cleanText)) {
      textBoost += 0.25;
    }
    if (cand.id === 'piatti-pronti' && /pizza|burger|lasagna pronta|piatto pronto|meal|zuppa|soup/i.test(cleanText)) {
      textBoost += 0.25;
    }
    if (cand.id === 'snack-salati' && /cracker|grissin|tarall|gallett|chips|patatine|snack|pretzel|salatini/i.test(cleanText)) {
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
