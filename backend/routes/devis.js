const express = require('express');
const crypto  = require('crypto');
const db      = require('../db');
const { verifyJWT } = require('../middleware/auth');
const router  = express.Router();

// POST /api/devis — créer un devis et son lien unique
router.post('/', verifyJWT, async (req, res) => {
  const { client_nom, client_email, client_tel, description, montant_ht, tva_pct, expire_days } = req.body;
  if (!description || !montant_ht)
    return res.status(400).json({ error: 'description et montant_ht requis' });

  const token = crypto.randomBytes(32).toString('hex');
  const expire_at = expire_days
    ? new Date(Date.now() + expire_days * 86400000)
    : new Date(Date.now() + 30 * 86400000); // 30j par défaut

  try {
    const { rows } = await db.query(
      `INSERT INTO devis (pro_id, token_unique, client_nom, client_email, client_tel,
         description, montant_ht, tva_pct, expire_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.id, token, client_nom, client_email, client_tel,
       description, montant_ht, tva_pct || 20, expire_at]
    );
    const lien = `${process.env.FRONTEND_URL}/payer/${token}`;
    res.status(201).json({ devis: rows[0], lien_unique: lien });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur', detail: e.message });
  }
});

// GET /api/devis — liste des devis du pro connecté
router.get('/', verifyJWT, async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM devis WHERE pro_id=$1 ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json(rows);
});

// GET /api/devis/token/:token — accès client via lien unique (pas d'auth)
router.get('/token/:token', async (req, res) => {
  const { rows } = await db.query(
    `SELECT d.*, p.nom AS pro_nom, p.prenom AS pro_prenom, p.activite
     FROM devis d JOIN pros p ON d.pro_id = p.id
     WHERE d.token_unique=$1`, [req.params.token]
  );
  if (!rows.length) return res.status(404).json({ error: 'Lien invalide' });
  const d = rows[0];
  if (d.expire_at && new Date(d.expire_at) < new Date())
    return res.status(410).json({ error: 'Lien expiré' });
  // On masque les infos sensibles du pro
  res.json({
    id: d.id, description: d.description,
    montant_ht: d.montant_ht, tva_pct: d.tva_pct, montant_ttc: d.montant_ttc,
    statut: d.statut, expire_at: d.expire_at,
    pro_nom: d.pro_nom, pro_prenom: d.pro_prenom, activite: d.activite,
  });
});

module.exports = router;
