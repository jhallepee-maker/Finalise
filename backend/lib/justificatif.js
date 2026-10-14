const PDFDocument = require('pdfkit');
const db = require('../db');

const fmtEUR  = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
const fmtDate = d => new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'medium' });

// Données du justificatif pour un devis signé (via son lien unique), ou null
async function loadJustificatif(token) {
  const { rows } = await db.query(
    `SELECT d.*, p.nom AS pro_nom, p.prenom AS pro_prenom, p.siret AS pro_siret, p.activite AS pro_activite,
            s.nom_signe, s.signe_at, s.ip_address, s.user_agent, s.contenu_snapshot, s.contenu_hash
       FROM devis d
       JOIN pros p ON p.id = d.pro_id
       JOIN signatures s ON s.devis_id = d.id
      WHERE d.token_unique = $1
      ORDER BY s.signe_at DESC LIMIT 1`, [token]
  );
  return rows[0] || null;
}

// Génère le PDF en mémoire (Buffer) — utilisé par la route HTTP et par les emails
function renderJustificatifPdf(r) {
  return new Promise((resolve, reject) => {
    const snap = r.contenu_snapshot || {};
    const hash = r.contenu_hash;
    const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: 'Justificatif de signature électronique' } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const label = (t) => doc.fontSize(8).fillColor('#777').text(t.toUpperCase(), { characterSpacing: 0.8 });
    const value = (t) => doc.fontSize(11).fillColor('#111').text(t || '—').moveDown(0.7);

    doc.fontSize(20).fillColor('#111').text('Finalise');
    doc.fontSize(14).text('Justificatif de signature électronique').moveDown(1.2);

    label('Prestataire');
    value(`${[r.pro_prenom, r.pro_nom].filter(Boolean).join(' ')}${r.pro_activite ? ' — ' + r.pro_activite : ''}${r.pro_siret ? '\nSIRET ' + r.pro_siret : ''}`);
    const cl = snap.client || { nom: snap.client_nom || r.client_nom, email: snap.client_email || r.client_email };
    label('Client');
    value([cl.nom, cl.email, cl.tel, cl.adresse].filter(Boolean).join('\n'));
    label(`Prestation signée${snap.numero ? ' — devis ' + snap.numero : ''}`);
    value([snap.objet, (Array.isArray(snap.dates) && snap.dates.length ? `Date(s) : ${snap.dates.join(' ; ')}` : snap.date_prestation && `Date : ${snap.date_prestation}`), snap.participants && `Participants : ${snap.participants}`].filter(Boolean).join('\n') || snap.description || r.description);
    if (Array.isArray(snap.lignes)) {
      doc.fontSize(10).fillColor('#111');
      const ttc = snap.prix_mode === 'ttc';
      for (const l of snap.lignes) {
        const u = ttc && l.prix_unitaire_ttc != null ? l.prix_unitaire_ttc : l.prix_unitaire_ht;
        doc.text(`• ${l.description} — ${Number(l.quantite)} × ${fmtEUR(u)} ${ttc ? 'TTC' : 'HT'}`);
      }
      doc.moveDown(0.7);
    }
    label('Montants');
    value(snap.tva_mode === 'non_applicable' ? `Total net ${fmtEUR(snap.montant_ttc ?? r.montant_ttc)} — TVA non applicable` : `HT ${fmtEUR(snap.montant_ht ?? r.montant_ht)}  ·  TVA ${snap.tva_pct ?? r.tva_pct} %  ·  TTC ${fmtEUR(snap.montant_ttc ?? r.montant_ttc)}`);
    if (snap.cases) {
      label('Cases cochées par le signataire');
      value([
        snap.cases.accept_devis && 'Lu et accepté le devis',
        snap.cases.accept_cgv && `Lu et accepté les CGV (${snap.cgv_nom ? 'PDF « ' + snap.cgv_nom + ' », empreinte SHA-256 ' + snap.cgv_hash : snap.cgv_url})`,
        snap.cases.accept_rgpd && 'Pris connaissance de la politique de confidentialité (RGPD)',
        snap.cases.accept_signature && 'Signature électronique (art. 1366 du Code civil)',
      ].filter(Boolean).map(t => '☑ ' + t).join('\n').replace(/☑/g, '[x]'));
    }

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
    doc.font('Courier').fontSize(9).fillColor('#111')
      .text(hash || "non disponible (signature antérieure à la mise en place de l'empreinte)")
      .font('Helvetica').moveDown(1.2);

    doc.fontSize(8).fillColor('#777').text(
      "Le signataire a coché la case de consentement et signé électroniquement ce devis (articles 1366 et 1367 du Code civil). " +
      "L'empreinte SHA-256 identifie de façon unique le contenu présenté au signataire au moment de la signature : " +
      'toute modification ultérieure du devis produirait une empreinte différente. Référence devis : ' + r.id + '.',
      { align: 'justify' }
    );
    doc.end();
  });
}

module.exports = { loadJustificatif, renderJustificatifPdf };
