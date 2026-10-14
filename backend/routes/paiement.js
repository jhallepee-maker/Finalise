const crypto  = require('crypto');
const express = require('express');
const db      = require('../db');
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

  res.json({ message: 'Signature enregistrée', devis_id: d.id, signe_at: signed[0].signe_at, hash });
});

const fmtEUR = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
const fmtDate = d => new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'medium' });

// GET /api/paiement/justificatif/:token — PDF de preuve de signature (accessible via le lien unique)
router.get('/justificatif/:token', async (req, res) => {
  const { rows } = await db.query(
    `SELECT d.*, p.nom AS pro_nom, p.prenom AS pro_prenom, p.siret AS pro_siret, p.activite AS pro_activite,
            s.nom_signe, s.signe_at, s.ip_address, s.user_agent, s.contenu_snapshot, s.contenu_hash
       FROM devis d
       JOIN pros p ON p.id = d.pro_id
       JOIN signatures s ON s.devis_id = d.id
      WHERE d.token_unique = $1
      ORDER BY s.signe_at DESC LIMIT 1`, [req.params.token]
  );
  if (!rows.length) return res.status(404).json({ error: 'Aucune signature pour ce devis' });
  const r = rows[0];
  const snap = r.contenu_snapshot || {};
  const hash = r.contenu_hash;

  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: 'Justificatif de signature électronique' } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="justificatif-${String(r.id).slice(0, 8)}.pdf"`);
  doc.pipe(res);

  const label = (t) => doc.fontSize(8).fillColor('#777').text(t.toUpperCase(), { characterSpacing: 0.8 });
  const value = (t) => doc.fontSize(11).fillColor('#111').text(t || '—').moveDown(0.7);

  doc.fontSize(20).fillColor('#111').text('Finalise', { continued: false });
  doc.fontSize(14).text('Justificatif de signature électronique').moveDown(1.2);

  label('Prestataire');
  value(`${[r.pro_prenom, r.pro_nom].filter(Boolean).join(' ')}${r.pro_activite ? ' — ' + r.pro_activite : ''}${r.pro_siret ? '\nSIRET ' + r.pro_siret : ''}`);
  label('Client');
  value(`${snap.client_nom || r.client_nom || '—'}${(snap.client_email || r.client_email) ? '\n' + (snap.client_email || r.client_email) : ''}`);
  label('Prestation signée');
  value(snap.description || r.description);
  label('Montants');
  value(`HT ${fmtEUR(snap.montant_ht ?? r.montant_ht)}  ·  TVA ${snap.tva_pct ?? r.tva_pct} %  ·  TTC ${fmtEUR(snap.montant_ttc ?? r.montant_ttc)}`);

  doc.moveDown(0.5).strokeColor('#ddd').moveTo(56, doc.y).lineTo(539, doc.y).stroke().moveDown(1);

  label('Signataire');
  value(r.nom_signe);
  label('Date et heure (Europe/Paris)');
  value(fmtDate(r.signe_at));
  label('Adresse IP');
  value(r.ip_address);
  label('Navigateur');
  value(r.user_agent);
  label('Empreinte du contenu signé (SHA-256)');
  doc.font('Courier').fontSize(9).fillColor('#111').text(hash || 'non disponible (signature antérieure à la mise en place de l\'empreinte)').font('Helvetica').moveDown(1.2);

  doc.fontSize(8).fillColor('#777').text(
    'Le signataire a coché la case de consentement et signé électroniquement ce devis (articles 1366 et 1367 du Code civil). ' +
    'L\'empreinte SHA-256 identifie de façon unique le contenu présenté au signataire au moment de la signature : ' +
    'toute modification ultérieure du devis produirait une empreinte différente. Référence devis : ' + r.id + '.',
    { align: 'justify' }
  );
  doc.end();
});

module.exports = router;
