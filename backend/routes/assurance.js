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

// POST /api/assurance/webhook/meetch — claim.refunded (secret partagé dans l'en-tête x-finalise-secret, à configurer côté Meetch)
router.post('/webhook/meetch', handle(async (req, res) => {
  const secret = process.env.MEETCH_WEBHOOK_SECRET;
  const got = String(req.headers['x-finalise-secret'] || '');
  const ok = secret && got.length === secret.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret));
  if (!ok) throw new HttpError(401, 'Non autorisé');
  const b = req.body || {};
  if (b.event !== 'claim.refunded' && b.type !== 'claim.refunded') return res.json({ received: true });
  const data = b.data || b;
  const ref = data.order_reference || data.reference;
  const sub = data.subscription_id || data.id;
  await db.query(`UPDATE devis SET meetch_status='refunded' WHERE (numero=$1 AND $1 IS NOT NULL) OR (meetch_subscription_id=$2 AND $2 IS NOT NULL)`, [ref || null, sub ? String(sub) : null]);
  res.json({ received: true });
}));

module.exports = router;
