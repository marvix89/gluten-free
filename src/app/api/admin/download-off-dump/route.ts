import { auth } from '@/lib/auth';
import fs from 'fs';
import path from 'path';
import https from 'https';

const OFF_DUMP_URL = 'https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz';
const DUMP_FILENAME = 'openfoodfacts-products.jsonl.gz';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return Response.json({ error: 'Accesso negato' }, { status: 403 });
  }

  let outputDir: string;
  try {
    const body = await request.json();
    outputDir = body.outputDir?.trim();
    if (!outputDir) throw new Error('outputDir mancante');
  } catch {
    return Response.json({ error: 'Body non valido: specificare outputDir' }, { status: 400 });
  }

  // Risolvi il percorso e verifica che sia accessibile
  const resolvedDir = path.resolve(outputDir);
  const outputPath = path.join(resolvedDir, DUMP_FILENAME);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: object) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { /* controller già chiuso */ }
      };

      try {
        // Crea la directory se non esiste
        if (!fs.existsSync(resolvedDir)) {
          fs.mkdirSync(resolvedDir, { recursive: true });
        }

        send('progress', {
          type: 'start',
          message: `⬇️  Avvio download da OpenFoodFacts...`,
          url: OFF_DUMP_URL,
          outputPath,
        });

        await new Promise<void>((resolve, reject) => {
          const doRequest = (url: string, redirects = 0) => {
            if (redirects > 5) return reject(new Error('Troppi redirect'));

            const req = https.get(url, {
              headers: {
                'User-Agent': 'gluten-free-app/1.0 - https://github.com/marvix89/gluten-free',
              }
            }, (res) => {
              // Gestione redirect
              if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                res.resume();
                doRequest(res.headers.location, redirects + 1);
                return;
              }

              if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                return;
              }

              const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
              let downloadedBytes = 0;
              let lastProgressReport = Date.now();

              const fileStream = fs.createWriteStream(outputPath);

              res.on('data', (chunk: Buffer) => {
                downloadedBytes += chunk.length;
                const now = Date.now();
                // Invia progresso ogni 2 secondi
                if (now - lastProgressReport > 2000) {
                  const pct = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : -1;
                  const mb = (downloadedBytes / 1024 / 1024).toFixed(1);
                  const totalMb = totalBytes > 0 ? (totalBytes / 1024 / 1024).toFixed(0) : '?';
                  send('progress', {
                    type: 'downloading',
                    downloadedBytes,
                    totalBytes,
                    pct,
                    message: `⬇️  Scaricato ${mb} MB / ${totalMb} MB (${pct >= 0 ? pct + '%' : 'dimensione sconosciuta'})`,
                  });
                  lastProgressReport = now;
                }
              });

              res.pipe(fileStream);

              fileStream.on('finish', () => {
                const mb = (downloadedBytes / 1024 / 1024).toFixed(1);
                send('done', {
                  outputPath,
                  downloadedBytes,
                  message: `✅ Download completato! File salvato in:\n${outputPath}\n(${mb} MB)`,
                });
                resolve();
              });

              fileStream.on('error', reject);
              res.on('error', reject);
            });

            req.on('error', reject);
          };

          doRequest(OFF_DUMP_URL);
        });

      } catch (err: any) {
        // Rimuovi file parziale in caso di errore
        if (fs.existsSync(outputPath)) {
          try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
        }
        console.error('[download-off-dump] Error:', err);
        send('error', { message: err?.message || 'Errore durante il download' });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    }
  });
}
