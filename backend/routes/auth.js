const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../db');
const { verifyJWT } = require('../middleware/auth');
const router   = express.Router();

// POST /api/auth/register — inscription pro
router.post('/register', async (req, res) => {
  const { email, password, nom, prenom, siret, activite } = req.body;
  if (!email || !password || !nom)
    return res.status(400).json({ error: 'email, password et nom requis' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await db.query(
      `INSERT INTO pros (email, password_hash, nom, prenom, siret, activite)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, email, nom`,
      [email, hash, nom, prenom, siret, activite]
    );
    const token = jwt.sign({ id: rows[0].id, email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, pro: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email déjà utilisé' });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { rows } = await db.query('SELECT * FROM pros WHERE email=$1', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Identifiants incorrects' });
    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Identifiants incorrects' });
    const token = jwt.sign({ id: rows[0].id, email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, pro: { id: rows[0].id, email: rows[0].email, nom: rows[0].nom } });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/auth/me — profil connecté
router.get('/me', verifyJWT, async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, email, nom, prenom, siret, activite, stripe_account_id FROM pros WHERE id=$1',
    [req.user.id]
  );
  res.json(rows[0]);
});

module.exports = router;
