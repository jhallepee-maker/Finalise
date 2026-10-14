const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { verifyJWT } = require('../middleware/auth');
const { HttpError, handle } = require('../lib/httpError');
const router = express.Router();

const COLS = 'id, email, nom, prenom, activite, siret, telephone, adresse, code_postal, ville, tva_franchise, cgv_url';
const str = (v, max) => String(v ?? '').trim().slice(0, max);

const langOf = (q) => (String(q.langue || 'fr').toLowerCase() === 'en' ? 'en' : 'fr');
const colOf = (l) => (l === 'en' ? 'cgv_en_version_id' : 'cgv_version_id');

async function cgvInfo(proId) {
  const out = {};
  for (const l of ['fr', 'en']) {
    const { rows } = await db.query(
      `SELECT v.nom, v.hash, v.taille, v.created_at FROM pros p JOIN cgv_versions v ON v.id=p.${colOf(l)} WHERE p.id=$1`, [proId]);
    out[l] = rows[0] || null;
  }
  return out;
}

router.get('/', verifyJWT, handle(async (req, res) => {
  const { rows } = await db.query(`SELECT ${COLS} FROM pros WHERE id=$1`, [req.user.id]);
  if (!rows[0]) throw new HttpError(404, 'Compte introuvable');
  res.json({ ...rows[0], cgv_pdf: await cgvInfo(req.user.id) });
}));

// PUT /api/profil/cgv?langue=fr|en&nom=cgv.pdf — corps = PDF brut (5 Mo max). Chaque envoi crée une version conservée.
router.put('/cgv', verifyJWT, express.raw({ type: 'application/pdf', limit: '5mb' }), handle(async (req, res) => {
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.length < 100) throw new HttpError(400, 'Envoyez un fichier PDF');
  if (buf.slice(0, 5).toString('latin1') !== '%PDF-') throw new HttpError(400, "Ce fichier n'est pas un PDF valide");
  const langue = langOf(req.query);
  const nom = str(req.query.nom, 200).replace(/[^\w.\- àâäçéèêëîïôöùûüÿ()]/gi, '_') || 'cgv.pdf';
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const { rows } = await db.query(
    `INSERT INTO cgv_versions (pro_id, nom, hash, taille, pdf, langue) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (pro_id, hash) DO UPDATE SET nom=EXCLUDED.nom, langue=EXCLUDED.langue RETURNING id`,
    [req.user.id, nom, hash, buf.length, buf, langue]);
  await db.query(`UPDATE pros SET ${colOf(langue)}=$2 WHERE id=$1`, [req.user.id, rows[0].id]);
  res.json(await cgvInfo(req.user.id));
}));

// DELETE /api/profil/cgv?langue=fr|en — retire les CGV proposées (les versions déjà acceptées restent conservées)
router.delete('/cgv', verifyJWT, handle(async (req, res) => {
  await db.query(`UPDATE pros SET ${colOf(langOf(req.query))}=NULL WHERE id=$1`, [req.user.id]);
  res.json(await cgvInfo(req.user.id));
}));

router.put('/', verifyJWT, handle(async (req, res) => {
  const b = req.body || {};
  const siret = str(b.siret, 20).replace(/\s/g, '');
  if (siret && !/^\d{14}$/.test(siret)) throw new HttpError(400, 'SIRET invalide (14 chiffres)');
  const cgv = str(b.cgv_url, 500);
  if (cgv && !/^https:\/\/\S+$/i.test(cgv)) throw new HttpError(400, 'Le lien des CGV doit commencer par https://');
  const nom = str(b.nom, 100);
  if (!nom) throw new HttpError(400, 'Nom requis');

  const { rows } = await db.query(
    `UPDATE pros SET nom=$2, prenom=$3, activite=$4, siret=$5, telephone=$6, adresse=$7,
       code_postal=$8, ville=$9, tva_franchise=$10, cgv_url=$11
     WHERE id=$1 RETURNING ${COLS}`,
    [req.user.id, nom, str(b.prenom, 100) || null, str(b.activite, 150) || null, siret || null,
     str(b.telephone, 30) || null, str(b.adresse, 255) || null, str(b.code_postal, 10) || null,
     str(b.ville, 120) || null, b.tva_franchise === true, cgv || null]
  );
  res.json({ ...rows[0], cgv_pdf: await cgvInfo(req.user.id) });
}));

module.exports = router;
