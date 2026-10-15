const express = require('express');
const db      = require('../db');
const { verifyJWT } = require('../middleware/auth');
const { notifyDevisCreated, fire } = require('../lib/notifications');
const { handle, HttpError } = require('../lib/httpError');
const { createDevis, getPublicDevis, getLignes } = require('../services/devisService');
const router  = express.Router();

// POST /api/devis — créer un devis (lignes, date de prestation, champs client à compléter) et son lien unique
router.post('/', verifyJWT, handle(async (req, res) => {
  const d = await createDevis(req.user.id, req.body || {});
  if (req.user.actor) await db.query('UPDATE devis SET created_by=$2 WHERE id=$1', [d.id, req.user.actor]);
  fire(notifyDevisCreated, d.id);
  res.status(201).json(d);
}));

// PUT /api/devis/:id — corriger un devis non signé (même numéro, même lien)
router.put('/:id', verifyJWT, handle(async (req, res) => {
  res.json(await createDevis(req.user.id, req.body || {}, req.params.id));
}));

// Un devis non signé dont le lien a expiré s'affiche « expiré » (le statut en base reste en_attente)
const view = d => (d.statut === 'en_attente' && d.expire_at && new Date(d.expire_at) < new Date() ? { ...d, statut: 'expire' } : d);

// GET /api/devis — liste des devis du pro connecté
router.get('/', verifyJWT, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM devis WHERE pro_id=$1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(rows.map(view));
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/devis/token/:token — accès client via lien unique (sans auth)
// IMPORTANT : déclarée AVANT /:id pour ne pas être capturée par elle
router.get('/token/:token', handle(async (req, res) => {
  const d = await getPublicDevis(req.params.token);
  if (!d) throw new HttpError(404, 'Lien invalide');
  res.json(d);
}));

// GET /api/devis/:id — détail d'un devis (pro connecté, propriétaire uniquement)
router.get('/:id', verifyJWT, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT d.*,
         to_json(p.*) AS paiement,
         to_json(s.*) AS signature
       FROM devis d
       LEFT JOIN paiements p ON p.devis_id = d.id
       LEFT JOIN signatures s ON s.devis_id = d.id
       WHERE d.id=$1 AND d.pro_id=$2`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Devis introuvable' });
    const lignes = await getLignes(rows[0].id);
    const { rows: fa } = await db.query('SELECT numero, emise_at FROM factures WHERE devis_id=$1', [rows[0].id]);
    res.json({ ...view(rows[0]), lignes, facture: fa[0] || null });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/devis/:id — supprimer un devis en attente uniquement
router.delete('/:id', verifyJWT, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, statut FROM devis WHERE id=$1 AND pro_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Devis introuvable' });
    if (rows[0].statut !== 'en_attente')
      return res.status(400).json({ error: 'Seul un devis en attente peut être supprimé' });

    await db.query('DELETE FROM devis WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
