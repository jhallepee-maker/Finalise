const crypto  = require('crypto');
const express = require('express');
const db      = require('../db');
const { loadJustificatif, renderJustificatifPdf } = require('../lib/justificatif');
const { notifySigned, fire } = require('../lib/notifications');
const router  = express.Router();

// Snapshot figé du devis tel que vu par le client (ordre des clés fixe → hash stable)
function snapshotDevis(d) {
  return {
    devis_id:     d.id,
    pro_id:       d.pro_id,
    client_nom:   d.client_nom,
    client_email: d.client_email,
    description:  d.description,
    montant_ht:   String(d.montant_ht),
    tva_pct:      String(d.tva_pct),
    montant_ttc:  String(d.montant_ttc),
  };
}

// POST /api/paiement/signer — signature électronique client
router.post('/signer', async (req, res) => {
  const { token, nom_signe } = req.body;
  if (!token || !nom_signe)
    return res.status(400).json({ error: 'token et nom_signe requis' });

  const { rows } = await db.query(
    'SELECT * FROM devis WHERE token_unique=$1', [token]
  );
  if (!rows.length) return res.status(404).json({ error: 'Devis introuvable' });
  if (rows[0].statut !== 'en_attente')
    return res.status(400).json({ error: `Devis déjà ${rows[0].statut}` });
  if (rows[0].expire_at && new Date(rows[0].expire_at) < new Date())
    return res.status(410).json({ error: 'Ce lien a expiré' });

  const d = rows[0];
  // x-forwarded-for peut contenir une chaîne d'IP : on garde le client d'origine
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0].trim().slice(0, 45);
  const ua = req.headers['user-agent'];

  const snapshot = snapshotDevis(d);
  const hash = crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');

  // Une seule requête atomique : passage à 'signe' + insertion de la signature.
  // Si deux signatures arrivent en même temps, une seule passe.
  const { rows: signed } = await db.query(
    `WITH upd AS (
       UPDATE devis SET statut='signe' WHERE id=$1 AND statut='en_attente' RETURNING id
     )
     INSERT INTO signatures (devis_id, nom_signe, ip_address, user_agent, contenu_snapshot, contenu_hash)
     SELECT id, $2, $3, $4, $5::jsonb, $6 FROM upd
     RETURNING signe_at`,
    [d.id, nom_signe, ip, ua, JSON.stringify(snapshot), hash]
  );
  if (!signed.length) return res.status(400).json({ error: 'Devis déjà signé' });

  fire(notifySigned, d.id); // email au pro (ignoré si l'envoi n'est pas configuré)
  res.json({ message: 'Signature enregistrée', devis_id: d.id, signe_at: signed[0].signe_at, hash });
});

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

module.exports = router;
