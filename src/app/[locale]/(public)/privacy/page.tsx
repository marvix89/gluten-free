export default function PrivacyPolicyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p><strong>Ultimo aggiornamento:</strong> 19/06/2026</p>
      
      <h2>1. Titolare del Trattamento dei Dati</h2>
      <p>
        Il titolare del trattamento dei dati è <strong>Balbi Martino</strong>, contattabile all'indirizzo email: <strong>marvix89@gmail.com</strong>.
      </p>

      <h2>2. Dati Raccolti</h2>
      <p>
        Durante la registrazione e l'uso dell'applicazione "Gluten Free", raccogliamo i seguenti dati personali:
      </p>
      <ul>
        <li><strong>Dati forniti dall'utente:</strong> Indirizzo email e password crittografata, necessari per creare e proteggere il tuo account.</li>
        <li><strong>Dati inseriti nell'app:</strong> I prodotti personalizzati (nome, descrizione, categoria, livello di glutine).</li>
        <li><strong>Dati di utilizzo:</strong> I tuoi ID prodotto preferiti.</li>
      </ul>

      <h2>3. Finalità del Trattamento</h2>
      <p>
        I tuoi dati vengono raccolti esclusivamente per erogare il servizio (permetterti l'accesso al tuo account personale, salvare i tuoi prodotti e la tua lista dei preferiti).
      </p>

      <h2>4. Sicurezza e Crittografia (Privacy by Design)</h2>
      <p>
        Tutte le password vengono sottoposte a un processo di <em>hashing</em> irreversibile (tramite algoritmo bcrypt). Inoltre, il testo e le descrizioni dei prodotti personalizzati che decidi di inserire vengono <strong>cifrati nel database con crittografia AES-256-GCM</strong>. Questo significa che nemmeno l'amministratore del sistema ha modo di leggere in chiaro le tue note.
      </p>

      <h2>5. Condivisione dei Dati</h2>
      <p>
        I tuoi dati non saranno venduti a terzi o condivisi per scopi di marketing. I dati sono ospitati su server cloud forniti dai nostri partner tecnici (es. Vercel, Neon DB) soggetti alle loro rigide policy di sicurezza.
      </p>

      <h2>6. Diritti dell'Utente</h2>
      <p>
        Hai il diritto di accedere, rettificare o richiedere la cancellazione permanente di tutti i tuoi dati associati all'account. Per esercitare questi diritti, puoi inviarci una mail all'indirizzo indicato al punto 1, oppure utilizzare le funzionalità di cancellazione ove disponibili all'interno dell'App.
      </p>
    </>
  );
}
