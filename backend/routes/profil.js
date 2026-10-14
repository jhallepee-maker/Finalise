const express = require('express');
const db = require('../db');
const { verifyJWT } = require('../middleware/auth');
const { HttpError, handle } = require('../lib/httpError');
const router = express.Router();

const COLS = 'id, email, nom, prenom, activite, siret, telephone, adresse, code_postal, ville, tva_franchise, cgv_url';
const str = (v, max) => String(v ?? '').trim().slice(0, max);

router.get('/', verifyJWT, handle(async (req, res) => {
  const { rows } = await db.query(`SELECT ${COLS} FROM pros WHERE id=$1`, [req.user.id]);
  if (!rows[0]) throw new HttpError(404, 'Compte introuvable');
  res.json(rows[0]);
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
  res.json(rows[0]);
}));

module.exports = router;
