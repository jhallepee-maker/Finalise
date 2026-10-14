// Envoi d'emails via l'API Resend (fetch natif, aucune dépendance).
// Sans RESEND_API_KEY, l'envoi est simplement ignoré (loggé) : le reste de l'app fonctionne normalement.
// Ne lève jamais d'exception : un email raté ne doit jamais casser une signature ou un paiement.
async function sendMail({ to, subject, html, attachments }) {
  if (!to) return { skipped: 'no-recipient' };
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[mail] RESEND_API_KEY absente — email ignoré (${subject} → ${to})`);
    return { skipped: 'no-key' };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || 'Finalise <onboarding@resend.dev>',
        to: [to],
        subject,
        html,
        attachments, // [{ filename, content (base64) }]
      }),
    });
    if (!r.ok) {
      console.error('[mail] échec Resend', r.status, await r.text());
      return { error: r.status };
    }
    return { ok: true };
  } catch (e) {
    console.error('[mail] erreur réseau', e.message);
    return { error: e.message };
  }
}

module.exports = { sendMail };
