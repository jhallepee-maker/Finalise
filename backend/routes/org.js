const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { verifyJWT } = require('../middleware/auth');
const { HttpError, handle } = require('../lib/httpError');
const router = express.Router();
const ROLES = ['guide', 'secretaire', 'admin'];
const str = (v, n) => String(v ?? '').trim().slice(0, n);

async function me(id) {
  const { rows } = await db.query('SELECT id, email, org_id, org_role FROM pros WHERE id=$1', [id]);
  if (!rows[0]) throw new HttpError(404, 'Compte introuvable');
  return rows[0];
}

// GET /api/org — mon organisation et ses membres (null si aucune)
router.get('/', verifyJWT, handle(async (req, res) => {
  const m = await me(req.user.id);
  if (!m.org_id) return res.json({ org: null });
  const { rows: o } = await db.query('SELECT id, nom FROM organisations WHERE id=$1', [m.org_id]);
  const { rows: membres } = await db.query(
    `SELECT id, nom, prenom, email, org_role, charges_enabled FROM pros WHERE org_id=$1 ORDER BY nom`, [m.org_id]);
  const invitations = m.org_role === 'admin'
    ? (await db.query(`SELECT code, email, role, expires_at FROM org_invitations WHERE org_id=$1 AND used_at IS NULL AND expires_at>NOW()`, [m.org_id])).rows : [];
  res.json({ org: o[0], mon_role: m.org_role, membres, invitations });
}));

// POST /api/org {nom} — créer un bureau (le créateur en devient admin)
router.post('/', verifyJWT, handle(async (req, res) => {
  const nom = str(req.body && req.body.nom, 255);
  if (!nom) throw new HttpError(400, 'Nom du bureau requis');
  const m = await me(req.user.id);
  if (m.org_id) throw new HttpError(409, 'Vous appartenez déjà à un bureau');
  const org = await db.tx(async tx => {
    const { rows } = await tx.query('INSERT INTO organisations (nom, created_by) VALUES ($1,$2) RETURNING id, nom', [nom, m.id]);
    await tx.query(`UPDATE pros SET org_id=$2, org_role='admin' WHERE id=$1`, [m.id, rows[0].id]);
    return rows[0];
  });
  res.status(201).json(org);
}));

// POST /api/org/invitations {email, role} — admin uniquement. Le compte invité doit ACCEPTER (consentement) avec ce code.
router.post('/invitations', verifyJWT, handle(async (req, res) => {
  const m = await me(req.user.id);
  if (m.org_role !== 'admin') throw new HttpError(403, 'Réservé aux administrateurs du bureau');
  const email = str(req.body && req.body.email, 255).toLowerCase();
  const role = req.body && req.body.role;
  if (!email) throw new HttpError(400, 'Email requis');
  if (!ROLES.includes(role) || role === 'admin') throw new HttpError(400, 'Rôle : guide ou secretaire');
  const code = crypto.randomBytes(9).toString('base64url');
  await db.query(`INSERT INTO org_invitations (code, org_id, email, role, expires_at) VALUES ($1,$2,$3,$4, NOW() + interval '7 days')`, [code, m.org_id, email, role]);
  res.status(201).json({ code, email, role });
}));

// POST /api/org/accept {code} — le compte connecté rejoint le bureau (l'email doit correspondre à l'invitation)
router.post('/accept', verifyJWT, handle(async (req, res) => {
  const m = await me(req.user.id);
  if (m.org_id) throw new HttpError(409, 'Vous appartenez déjà à un bureau');
  const { rows } = await db.query(`SELECT * FROM org_invitations WHERE code=$1 AND used_at IS NULL AND expires_at>NOW()`, [str(req.body && req.body.code, 32)]);
  const inv = rows[0];
  if (!inv || inv.email.toLowerCase() !== String(m.email).toLowerCase()) throw new HttpError(404, 'Invitation invalide ou expirée');
  await db.tx(async tx => {
    await tx.query(`UPDATE pros SET org_id=$2, org_role=$3 WHERE id=$1`, [m.id, inv.org_id, inv.role]);
    await tx.query(`UPDATE org_invitations SET used_at=NOW() WHERE code=$1`, [inv.code]);
  });
  res.json({ ok: true, role: inv.role });
}));

// DELETE /api/org/membres/:id — l'admin retire un membre ; chacun peut se retirer lui-même (le dernier admin ne peut pas partir)
router.delete('/membres/:id', verifyJWT, handle(async (req, res) => {
  const m = await me(req.user.id);
  if (!m.org_id) throw new HttpError(404, 'Aucun bureau');
  const self = req.params.id === m.id;
  if (!self && m.org_role !== 'admin') throw new HttpError(403, 'Réservé aux administrateurs du bureau');
  const { rows } = await db.query('SELECT id, org_role FROM pros WHERE id::text=$1 AND org_id=$2', [req.params.id, m.org_id]);
  if (!rows[0]) throw new HttpError(404, 'Membre introuvable');
  if (rows[0].org_role === 'admin') {
    const { rows: n } = await db.query(`SELECT count(*)::int c FROM pros WHERE org_id=$1 AND org_role='admin'`, [m.org_id]);
    if (n[0].c <= 1) throw new HttpError(409, 'Le dernier administrateur ne peut pas quitter le bureau');
  }
  await db.query(`UPDATE pros SET org_id=NULL, org_role=NULL WHERE id=$1`, [rows[0].id]);
  res.json({ ok: true });
}));

module.exports = router;
