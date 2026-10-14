const express = require('express');
const db      = require('../db');
const { loadJustificatif, renderJustificatifPdf } = require('../lib/justificatif');
const { notifySigned, fire } = require('../lib/notifications');
const { handle, HttpError } = require('../lib/httpError');
const { signDevis } = require('../services/devisService');
const { issueFacture, getFactureByToken } = require('../services/factureService');
const { renderFacturePdf } = require('../lib/facturePdf');
const router  = express.Router();

// POST /api/paiement/signer — signature électronique client (infos client + cases cochées)
router.post('/signer', handle(async (req, res) => {
  const { token } = req.body || {};
  if (!token) throw new HttpError(400, 'token requis');
  // x-forwarded-for peut contenir une chaîne d'IP : on garde le client d'origine
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0].trim().slice(0, 45);
  const r = await signDevis(token, req.body, ip, req.headers['user-agent']);
  fire(notifySigned, r.devis_id);
  res.json({ message: 'Signature enregistrée', ...r });
}));

// GET /api/paiement/justificatif/:token — PDF de preuve de signature (accessible via le lien unique)
router.get('/justificatif/:token', async (req, res) => {
  try {
    const r = await loadJustificatif(req.params.token);
    if (!r) return res.status(404).json({ error: 'Aucune signature pour ce devis' });
    const pdf = await renderJustificatifPdf(r);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="justificatif-${String(r.id).slice(0, 8)}.pdf"`);
    res.send(pdf);
  } catch (e) {
    console.error('[justificatif]', e.message);
    res.status(500).json({ error: 'Impossible de générer le justificatif' });
  }
});

// GET /api/paiement/facture/:token — facture acquittée en PDF (accessible via le lien unique)
router.get('/facture/:token', handle(async (req, res) => {
  const { rows } = await db.query('SELECT id, statut FROM devis WHERE token_unique=$1', [req.params.token]);
  if (!rows[0]) throw new HttpError(404, 'Devis introuvable');
  if (rows[0].statut !== 'paye') throw new HttpError(404, "Aucune facture : le devis n'est pas payé");
  const f = (await getFactureByToken(req.params.token)) || (await issueFacture(rows[0].id));
  if (!f) throw new HttpError(404, 'Facture indisponible');
  const pdf = await renderFacturePdf(f);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${f.numero}.pdf"`);
  res.send(pdf);
}));

module.exports = router;
