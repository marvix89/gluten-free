import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function sendPasswordResetEmail(email: string, resetLink: string) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('EMAIL_USER o EMAIL_PASS non configurati. Stampo il link di reset nella console:');
    console.log(`RESET LINK PER ${email}: ${resetLink}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: `"Gluten Free" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Ripristino Password - Gluten Free',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Ripristina la tua password</h2>
          <p>Hai richiesto di ripristinare la tua password su Gluten Free.</p>
          <p>Clicca sul pulsante sottostante per impostare una nuova password:</p>
          <div style="margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Reimposta Password
            </a>
          </div>
          <p style="font-size: 14px; color: #666;">
            Se il pulsante non funziona, copia e incolla questo link nel tuo browser:<br/>
            <a href="${resetLink}">${resetLink}</a>
          </p>
          <p style="font-size: 14px; color: #666;">
            Se non hai richiesto il ripristino, puoi ignorare questa email. Questo link scadrà tra un'ora.
          </p>
        </div>
      `,
    });
  } catch (error) {
    console.error('Errore invio email:', error);
    throw new Error('Impossibile inviare email');
  }
}
