const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../db');
const { verifyJWT } = require('../middleware/auth');
const { syncAccount } = require('../lib/stripeSync');
const router   = express.Router();

// POST /api/auth/register — inscription pro
router.post('/register', async (req, res) => {
  const { password, nom, prenom, siret, activite } = req.body;
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email || !password || !nom)
    return res.status(400).json({ error: 'email, password et nom requis' });
  if (String(password).length < 8)
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
  try {
    const { rows: dup } = await db.query('SELECT 1 FROM pros WHERE lower(email)=$1', [email]);
    if (dup.length) return res.status(409).json({ error: 'Email déjà utilisé' });
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
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  try {
    const { rows } = await db.query('SELECT * FROM pros WHERE lower(email)=$1', [email]);
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
    'SELECT id, email, nom, prenom, siret, activite, stripe_account_id, charges_enabled, details_submitted FROM pros WHERE id=$1',
    [req.user.id]
  );
  const me = rows[0];
  // Compte Stripe créé mais pas encore actif : on resynchronise (rattrape un webhook manqué)
  if (me && me.stripe_account_id && !me.charges_enabled) {
    const flags = await syncAccount(me.id, me.stripe_account_id);
    if (flags) Object.assign(me, flags);
  }
  res.json(me);
});

module.exports = router;
