/**
 * Helper client-side per l'ottimizzazione delle immagini prima dell'upload o della classificazione AI.
 * Utilizza HTML5 Canvas per comprimere, convertire in WebP e ridimensionare localmente senza caricare la rete.
 */

export interface ImageOptimizationOptions {
  maxDim?: number;
  quality?: number;
  format?: 'image/webp' | 'image/jpeg';
}

/**
 * Ottimizza un file immagine generico per l'upload (es. Cloudinary o DB).
 * Ridimensiona mantenendo le proporzioni entro il maxDim specificato (es. 800px) e converte in WebP.
 */
export async function optimizeImageForUpload(
  file: File,
  options: ImageOptimizationOptions = {}
): Promise<string> {
  const {
    maxDim = 800,
    quality = 0.82,
    format = 'image/webp',
  } = options;

  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('Il file fornito non è un\'immagine valida.'));
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new window.Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Impossibile ottenere il contesto 2D del Canvas.'));
      }

      // Migliora la qualità del rendering durante il ridimensionamento
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL(format, quality);
      resolve(dataUrl);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Errore nel caricamento dell\'immagine per l\'ottimizzazione.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Ridimensiona forzatamente un'immagine (da File o Data URL) esattamente a 224x224 pixel,
 * come richiesto dal modello AI MobileNet v2 (Xenova/mobilenet_v2_1.0_224).
 */
export async function optimizeImageForAI(input: File | string): Promise<string> {
  const targetWidth = 224;
  const targetHeight = 224;

  return new Promise((resolve, reject) => {
    const img = new window.Image();
    let objectUrl: string | null = null;

    if (typeof input !== 'string') {
      if (!input.type.startsWith('image/')) {
        return reject(new Error('File immagine non valido per l\'analisi AI.'));
      }
      objectUrl = URL.createObjectURL(input);
      img.src = objectUrl;
    } else {
      img.src = input;
    }

    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        return reject(new Error('Impossibile inizializzare il Canvas per l\'AI.'));
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Disegna l'immagine ridimensionata a 224x224
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      // Usiamo JPEG o WebP a 0.85 di qualità per minimizzare il payload in POST (~10-15KB)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve(dataUrl);
    };

    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('Impossibile elaborare l\'immagine per l\'inferenza AI.'));
    };
  });
}
