const db = require('./../db');
const { sendMail } = require('./mailer');
const { loadJustificatif, renderJustificatifPdf } = require('./justificatif');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtEUR = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(n));

const layout = (title, body) => `<!doctype html><html><body style="margin:0;background:#f6f6f4;padding:24px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e5e0;border-radius:12px;padding:28px">
<div style="font-weight:700;font-size:18px;margin-bottom:18px">Finalise</div>
<h2 style="font-size:17px;margin:0 0 14px">${esc(title)}</h2>
${body}
</div>
<div style="max-width:520px;margin:12px auto 0;font-size:11px;color:#888;text-align:center">Message automatique envoyé par Finalise.</div>
</body></html>`;

const button = (href, text) =>
  `<p style="margin:22px 0"><a href="${esc(href)}" style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block">${esc(text)}</a></p>`;

async function loadDevis(id) {
  const { rows } = await db.query(
    `SELECT d.*, p.email AS pro_email, p.nom AS pro_nom, p.prenom AS pro_prenom
       FROM devis d JOIN pros p ON p.id = d.pro_id WHERE d.id = $1`, [id]
  );
  return rows[0];
}

const proName = d => [d.pro_prenom, d.pro_nom].filter(Boolean).join(' ');

// 1) Au client : voici votre devis
async function notifyDevisCreated(devisId) {
  const d = await loadDevis(devisId);
  if (!d || !d.client_email) return;
  const link = `${process.env.FRONTEND_URL}/p/${d.token_unique}`;
  await sendMail({
    to: d.client_email,
    subject: `Votre devis de ${proName(d)} — ${fmtEUR(d.montant_ttc)}`,
    html: layout(`Devis de ${proName(d)}`,
      `<p>Bonjour${d.client_nom ? ' ' + esc(d.client_nom) : ''},</p>
       <p>${esc(proName(d))} vous a envoyé un devis :</p>
       <p style="background:#f6f6f4;border-radius:8px;padding:12px 14px">${esc(d.description)}<br><strong>${fmtEUR(d.montant_ttc)} TTC</strong></p>
       <p>Vous pouvez le consulter, le signer et régler en ligne :</p>
       ${button(link, 'Consulter et signer le devis')}
       ${d.expire_at ? `<p style="font-size:12px;color:#777">Ce lien est valable jusqu'au ${new Date(d.expire_at).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}.</p>` : ''}`),
  });
}

// 2) Au pro : votre client a signé
async function notifySigned(devisId) {
  const d = await loadDevis(devisId);
  if (!d) return;
  await sendMail({
    to: d.pro_email,
    subject: `${d.client_nom || 'Votre client'} a signé votre devis`,
    html: layout('Devis signé',
      `<p>${esc(d.client_nom || 'Votre client')} vient de signer le devis « ${esc(d.description)} » (${fmtEUR(d.montant_ttc)} TTC).</p>
       <p>Le paiement est maintenant attendu. Vous serez prévenu dès qu'il sera reçu.</p>
       ${button(`${process.env.FRONTEND_URL}/devis/${d.id}`, 'Voir le devis')}`),
  });
}

// 3) Paiement reçu : reçu + justificatif PDF au client, alerte au pro
async function notifyPaid(devisId) {
  const d = await loadDevis(devisId);
  if (!d) return;

  let attachments;
  try {
    const j = await loadJustificatif(d.token_unique);
    if (j) attachments = [{ filename: 'justificatif-signature.pdf', content: (await renderJustificatifPdf(j)).toString('base64') }];
  } catch (e) {
    console.error('[notify] PDF indisponible:', e.message);
  }

  if (d.client_email) {
    await sendMail({
      to: d.client_email,
      subject: `Paiement confirmé — ${fmtEUR(d.montant_ttc)}`,
      html: layout('Paiement confirmé',
        `<p>Bonjour${d.client_nom ? ' ' + esc(d.client_nom) : ''},</p>
         <p>Nous confirmons la réception de votre paiement de <strong>${fmtEUR(d.montant_ttc)}</strong> à ${esc(proName(d))} pour :</p>
         <p style="background:#f6f6f4;border-radius:8px;padding:12px 14px">${esc(d.description)}</p>
         <p>Vous trouverez en pièce jointe le justificatif de votre signature électronique.</p>`),
      attachments,
    });
  }

  await sendMail({
    to: d.pro_email,
    subject: `Paiement reçu — ${fmtEUR(d.montant_ttc)}`,
    html: layout('Paiement reçu',
      `<p>${esc(d.client_nom || 'Votre client')} a payé <strong>${fmtEUR(d.montant_ttc)}</strong> pour « ${esc(d.description)} ».</p>
       ${button(`${process.env.FRONTEND_URL}/devis/${d.id}`, 'Voir le détail')}`),
    attachments,
  });
}

// Lancer une notification sans jamais bloquer ni casser le flux appelant
const fire = (fn, ...args) => fn(...args).catch(e => console.error('[notify]', fn.name, e.message));

module.exports = { notifyDevisCreated, notifySigned, notifyPaid, fire };
