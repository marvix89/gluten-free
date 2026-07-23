/**
 * Feature Flags / Beta Flags
 *
 * Configurazione centralizzata per attivare o disattivare funzionalità
 * sperimentali o in fase di test/beta nel frontend.
 */

// Beta flag per l'internazionalizzazione (i18n) e la traduzione in lingua inglese.
// Di default è nascosta (false), ma può essere attivata impostando 
// la variabile d'ambiente NEXT_PUBLIC_ENABLE_ENGLISH_BETA="true" o NEXT_PUBLIC_ENABLE_I18N_BETA="true".
export const ENABLE_I18N_BETA = process.env.NEXT_PUBLIC_ENABLE_ENGLISH_BETA === 'true' || process.env.NEXT_PUBLIC_ENABLE_I18N_BETA === 'true';
export const ENABLE_ENGLISH_BETA = ENABLE_I18N_BETA;
