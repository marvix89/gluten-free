# Gluten Free

**Gluten Free** è una web application moderna progettata per supportare le persone intolleranti al glutine e i celiaci. Permette di consultare un catalogo di prodotti "sicuri", gestire una lista dei preferiti, aggiungere prodotti personalizzati salvando tutte le informazioni in modo sicuro e cifrato, e beneficiare di un'architettura avanzata arricchita da intelligenza artificiale, internazionalizzazione e gestione ottimizzata delle immagini su Cloudinary.

## 🚀 Architettura e Caratteristiche Principali

- **Catalogo Sicuro e Tassonomia Intelligente**: Un database strutturato di prodotti testati, divisi per categorie (Pasta, Pane, Snack, ecc.) con validazione automatica dei tag e classificazione chiara dei livelli di glutine (`Senza glutine`, `Tracce`, `Basso contenuto`).
- **AI Zero-Shot Classification & Vision**: Integrazione diretta con [`@xenova/transformers`](https://huggingface.co/docs/transformers.js) (modello `Xenova/clip-vit-base-patch32`) per la classificazione locale _Zero-Shot_ delle immagini e la verifica automatica delle categorie del cibo durante il caricamento o i task amministrativi.
- **Internazionalizzazione (i18n) in Beta**: Architettura di routing localizzata basata su `next-intl` (`src/proxy.ts`). L'**Italiano (`it`)** è la lingua di default servita in modo pulito senza alcun prefisso nell'URL (`/`, `/favorites`, ecc.). L'intera funzionalità multi-lingua (compreso il selettore nell'interfaccia UI con Italiano e Inglese) è disattivata di default ed è attivabile in modalità **Beta** tramite _Feature Flag_ (`NEXT_PUBLIC_ENABLE_ENGLISH_BETA="true"` / `NEXT_PUBLIC_ENABLE_I18N_BETA="true"`).
- **Gestione Immagini & CDN**:
  - **Cloudinary Integration**: Storage ottimizzato con trasformazioni automatiche per la consegna in formati moderni (WebP/AVIF), ridimensionamento dinamico (`src/lib/cloudinary.ts`) e redirect sicuro (`src/app/api/images/[id]`).
- **Integrazione OpenFoodFacts & Automazioni**: Import automatico, arricchimento e sincronizzazione continua di ingredienti, NutriScore e dettagli sui prodotti interrogando le API di [Open Food Facts](https://it.openfoodfacts.org/) (`src/lib/providers/open-food-facts.ts`).
- **Pannello Admin e Sincronizzazione Catalogo**: Area amministrativa avanzata (`/admin`) che offre strumenti per l'importazione automatica, ricategorizzazione massiva basata su AI (`/api/admin/re-categorize-all`), sincronizzazione immagini e gestione di intere tassonomie.
- **Sicurezza e Privacy End-to-End**: Autenticazione multi-utente con NextAuth v5 e password hashing (`bcryptjs`). I prodotti personalizzati caricati dagli utenti sono **cifrati tramite AES-256-GCM** (`src/lib/crypto.ts`), rendendo i dati sensibili inaccessibili persino agli amministratori del database.

---

## 🛠 Stack Tecnologico

- **Framework**: [Next.js 16 (App Router)](https://nextjs.org/) con supporto localizzazione (`[locale]`)
- **Linguaggio**: [TypeScript](https://www.typescriptlang.org/)
- **Database**: [Vercel Postgres / Neon DB](https://neon.tech/) (`@neondatabase/serverless`)
- **Autenticazione**: [NextAuth v5 (Auth.js)](https://authjs.dev/)
- **i18n & UI**: [`next-intl`](https://next-intl-docs.vercel.app/) + [`flag-icons`](https://flagicons.lipis.dev/)
- **AI & Computer Vision**: [`@xenova/transformers`](https://huggingface.co/docs/transformers.js) (Zero-Shot Image Classification pipeline)
- **Media Storage CDN**: [Cloudinary SDK](https://cloudinary.com/)
- **Stile e Design System**: Vanilla CSS con design system centralizzato in `globals.css` (CSS Variables, tema dark/premium responsive)

---

## 💻 Istruzioni per lo Sviluppo Locale

### 1. Requisiti

- Node.js 18+ o 20+
- Un database PostgreSQL (consigliato: Vercel Postgres o Neon)

### 2. Installazione

Clona il progetto ed entra nella directory:

```bash
git clone https://github.com/marvix89/gluten-free.git
cd gluten-free
npm install
```

### 3. Variabili d'Ambiente

Copia o crea il file `.env.local` nella root del progetto:

```bash
touch .env.local
```

Configura le seguenti chiavi nel tuo `.env.local`:

```env
# Database PostgreSQL (Neon / Vercel Postgres)
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"

# Auth & Sicurezza (CSPRNG 32 byte hex)
AUTH_SECRET="il-tuo-auth-secret-32-byte"
ENCRYPTION_KEY="la-tua-chiave-aes-256-gcm-32-byte"
AUTH_URL="http://localhost:3000"
AUTH_TRUST_HOST=true

# Storage Media & CDN
CLOUDINARY_CLOUD_NAME="il-tuo-cloud-name"
CLOUDINARY_API_KEY="la-tua-api-key"
CLOUDINARY_API_SECRET="il-tuo-api-secret"

# Feature Flags (opzionale - abilitazione Lingua Inglese Beta)
NEXT_PUBLIC_ENABLE_ENGLISH_BETA="true"

# Email Handling (opzionale per reset password via nodemailer)
EMAIL_USER="tuaemail@example.com"
EMAIL_PASS="tuapassword o app-password"
```

### 4. Avvio Server di Sviluppo

Esegui il server di sviluppo:

```bash
npm run dev
```

Vai all'indirizzo `http://localhost:3000`.

---

## ⚙️ Gestione e Manutenzione del Catalogo

Le operazioni di manutenzione e aggiornamento del catalogo (arricchimento prodotti tramite Open Food Facts, ricategorizzazione massiva AI e sincronizzazione immagini) sono interamente gestite tramite l'interfaccia di amministrazione web integrata (`/admin`). Non è più necessario eseguire script da riga di comando.

---

## 📄 Licenza

Questo progetto è **Proprietario**. Tutti i diritti sono riservati. Consulta il file [LICENSE](LICENSE) per i dettagli.
