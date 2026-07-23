/**
 * POST /api/images/upload
 *
 * Upload immagini custom — temporaneamente disabilitato.
 * Per ora le immagini vengono caricate solo tramite la sincronizzazione
 * automatica da OpenFoodFacts (/api/admin/sync-images).
 */
export async function POST() {
  return Response.json(
    { error: 'Upload immagini custom non disponibile al momento.' },
    { status: 501 }
  );
}
