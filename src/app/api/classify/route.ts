import { pipeline, RawImage } from '@xenova/transformers';
import { mapZeroShotPrediction, ZERO_SHOT_FOOD_CANDIDATES, classifyAndMapCategory } from '@/utils/taxonomy';

export const maxDuration = 15;
export const dynamic = 'force-dynamic';

class ImageClassifierSingleton {
  static task = 'zero-shot-image-classification' as const;
  static model = 'Xenova/clip-vit-base-patch32';
  static instance: Promise<any> | null = null;

  static async getInstance() {
    if (this.instance === null) {
      this.instance = pipeline(this.task, this.model, { quantized: true });
    }
    return this.instance;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { image } = body;

    if (!image || typeof image !== 'string') {
      return Response.json(
        { error: 'Immagine mancante o formato non valido nel payload.' },
        { status: 400 }
      );
    }

    let inputImage: any = image;
    if (typeof image === 'string' && image.startsWith('data:')) {
      const parts = image.split(',');
      const base64Data = parts[1];
      if (base64Data) {
        const buffer = Buffer.from(base64Data, 'base64');
        inputImage = await RawImage.fromBlob(new Blob([buffer]));
      }
    }

    const classifier = await ImageClassifierSingleton.getInstance();
    const candidateLabels = ZERO_SHOT_FOOD_CANDIDATES.map(c => c.label);
    const predictions = await classifier(inputImage, candidateLabels);

    const zeroShotResult = mapZeroShotPrediction(predictions);

    const formattedPredictions: Array<{ label: string; score: number }> = zeroShotResult
      ? zeroShotResult.topPredictions
      : Array.isArray(predictions)
      ? predictions.slice(0, 5).map((p: any) => ({
          label: p.label || 'sconosciuto',
          score: typeof p.score === 'number' ? Math.round(p.score * 100) / 100 : 0,
        }))
      : [];

    const mappedResult = zeroShotResult
      ? {
          categoryId: zeroShotResult.categoryId,
          categoryLabel: zeroShotResult.categoryLabel,
          emoji: zeroShotResult.emoji,
          confidence: zeroShotResult.confidence,
          matchedTag: zeroShotResult.categoryLabel,
          suggestedTags: formattedPredictions.map(p => p.label),
        }
      : classifyAndMapCategory(formattedPredictions);

    return Response.json({
      success: true,
      predictions: formattedPredictions,
      taxonomy: mappedResult,
    });
  } catch (error) {
    console.error('Errore durante la classificazione AI (/api/classify):', error);
    return Response.json(
      { error: (error as Error).message || 'Errore interno del server durante l\'analisi AI.' },
      { status: 500 }
    );
  }
}
