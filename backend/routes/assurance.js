const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const meetch = require('../lib/meetch');
const { HttpError, handle } = require('../lib/httpError');
const router = express.Router();

async function byToken(token) {
  const { rows } = await db.query('SELECT id, statut, montant_ttc, assurance_choix, assurance_montant FROM devis WHERE token_unique=$1', [token]);
  if (!rows[0]) throw new HttpError(404, 'Devis introuvable');
  return rows[0];
}
const out = d => ({ enabled: true, choix: d.assurance_choix, prime: d.assurance_montant == null ? null : Number(d.assurance_montant) });

// GET /api/assurance/:token — offre (prime) ou {enabled:false}
router.get('/:token', handle(async (req, res) => {
  if (!meetch.enabled()) return res.json({ enabled: false });
  const d = await byToken(req.params.token);
  const prime = d.assurance_montant != null ? Number(d.assurance_montant) : await meetch.premium(Number(d.montant_ttc));
  res.json({ ...out(d), prime });
}));

// POST /api/assurance/:token {choix:'oui'|'non'} — réponse obligatoire avant paiement (modifiable tant que non payé)
router.post('/:token', handle(async (req, res) => {
  if (!meetch.enabled()) throw new HttpError(404, 'Assurance indisponible');
  const choix = req.body && req.body.choix;
  if (choix !== 'oui' && choix !== 'non') throw new HttpError(400, 'Réponse oui ou non requise');
  const d = await byToken(req.params.token);
  if (d.statut !== 'signe') throw new HttpError(400, 'Le devis doit être signé avant de choisir');
  const prime = choix === 'oui' ? await meetch.premium(Number(d.montant_ttc)) : null;
  await db.query(`UPDATE devis SET assurance_choix=$2, assurance_montant=$3, assurance_choix_at=NOW() WHERE id=$1`, [d.id, choix, prime]);
  res.json({ enabled: true, choix, prime });
}));

// POST /api/assurance/webhook/meetch — webhooks Meetch signés : en-tête Webhook-Signature "t=<unix>,k=<hmac>"
// HMAC-SHA256(clé = MEETCH_WEBHOOK_SECRET, "<t>:<JSON du corps>"). Tolérance 5 min.
function signatureOk(req) {
  const secret = process.env.MEETCH_WEBHOOK_SECRET;
  const h = String(req.headers['webhook-signature'] || '');
  if (!secret || !h) return false;
  const m = Object.fromEntries(h.split(',').map(x => x.split('=')).filter(x => x.length >= 2).map(([k, ...v]) => [k.trim(), v.join('=')]));
  if (!m.t || !m.k || Math.abs(Date.now() / 1000 - Number(m.t)) > 300) return false;
  const exp = crypto.createHmac('sha256', secret).update(`${m.t}:${JSON.stringify(req.body)}`, 'utf8').digest('hex');
  return exp.length === m.k.length && crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(m.k));
}
const STATUS = { 'claim.opened': 'claim_opened', 'claim.refused': 'claim_refused', 'claim.refunded': 'refunded' };

router.post('/webhook/meetch', handle(async (req, res) => {
  if (!signatureOk(req)) throw new HttpError(401, 'Signature invalide');
  const type = req.body && req.body.event && req.body.event.type;
  const st = STATUS[type];
  if (!st) return res.json({ received: true });
  const rr = (req.body.data && req.body.data.refund_request) || {};
  const ref = rr.order_reference || null;
  const sub = rr.subscription_reference ? String(rr.subscription_reference) : null;
  if (ref || sub) await db.query(
    `UPDATE devis SET meetch_status=$3 WHERE (meetch_subscription_id=$2 AND $2 IS NOT NULL) OR (numero=$1 AND $1 IS NOT NULL)`, [ref, sub, st]);
  res.json({ received: true });
}));

module.exports = router;
