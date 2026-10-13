const express = require('express');
const db      = require('../db');
const router  = express.Router();

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

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const ua = req.headers['user-agent'];

  await db.query(
    `INSERT INTO signatures (devis_id, nom_signe, ip_address, user_agent) VALUES ($1,$2,$3,$4)`,
    [rows[0].id, nom_signe, ip, ua]
  );
  await db.query(`UPDATE devis SET statut='signe' WHERE id=$1`, [rows[0].id]);

  res.json({ message: 'Signature enregistrée', devis_id: rows[0].id, signe_at: new Date() });
});

module.exports = router;
