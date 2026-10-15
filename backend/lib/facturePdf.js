const PDFDocument = require('pdfkit');

const eur = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(n)).replace(/[  ]/g, ' ');
const dt  = d => new Date(d).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long' });

// Facture acquittée (PDF en mémoire) à partir de la ligne `factures`
function renderFacturePdf(f) {
  return new Promise((resolve, reject) => {
    const s = f.snapshot, pro = s.pro || {}, cl = s.client || {};
    const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: `Facture ${f.numero}` } });
    const chunks = [];
    doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);

    doc.fontSize(20).fillColor('#111').text('FACTURE', { continued: false });
    doc.fontSize(10).fillColor('#555').text(`N° ${f.numero}  ·  émise le ${dt(f.emise_at)}`);
    if (s.devis_numero) doc.text(`Devis accepté : ${s.devis_numero}`);
    doc.moveDown(1);

    const top = doc.y;
    doc.fontSize(8).fillColor('#777').text('PRESTATAIRE', 56, top);
    doc.fontSize(10).fillColor('#111').text([pro.nom, pro.activite, pro.adresse, pro.siret && `SIRET ${pro.siret}`, pro.telephone, pro.email].filter(Boolean).join('\n'), 56, top + 12, { width: 230 });
    doc.fontSize(8).fillColor('#777').text('CLIENT', 320, top);
    doc.fontSize(10).fillColor('#111').text([cl.nom, cl.adresse, cl.email, cl.tel].filter(Boolean).join('\n'), 320, top + 12, { width: 220 });
    doc.x = 56; doc.y = Math.max(doc.y, top + 90);

    if (s.objet || s.date_prestation || s.participants) {
      doc.moveDown(0.5).fontSize(10).fillColor('#111');
      if (s.objet) doc.text(`Objet : ${s.objet}`);
      if (s.date_prestation) doc.text(`Date de la prestation : ${s.date_prestation}`);
      if (s.participants) doc.text(`Participants : ${s.participants}`);
    }
    doc.moveDown(1);

    // Tableau des lignes
    const col = { d: 56, q: 330, p: 380, t: 460 };
    const ttcMode = s.prix_mode === 'ttc' || pro.tva_franchise;
    const sfx = pro.tva_franchise ? '' : (ttcMode ? ' TTC' : ' HT');
    const unit = l => Number(ttcMode && l.prix_unitaire_ttc != null ? l.prix_unitaire_ttc : l.prix_unitaire_ht);
    doc.fontSize(8).fillColor('#777');
    const hy = doc.y;
    doc.text('DESCRIPTION', col.d, hy).text('QTÉ', col.q, hy).text('PU' + sfx, col.p, hy).text('TOTAL' + sfx, col.t, hy);
    doc.moveTo(56, hy + 12).lineTo(539, hy + 12).strokeColor('#ddd').stroke();
    doc.y = hy + 18;
    doc.fontSize(10).fillColor('#111');
    for (const l of s.lignes || []) {
      const y = doc.y;
      doc.text(l.description, col.d, y, { width: 260 });
      const h = doc.y;
      doc.text(String(Number(l.quantite)), col.q, y).text(eur(unit(l)), col.p, y, { width: 75 })
         .text(eur(Number(l.quantite) * unit(l)), col.t, y, { width: 80 });
      doc.y = Math.max(h, y + 14) + 4;
    }
    doc.moveTo(56, doc.y).lineTo(539, doc.y).strokeColor('#ddd').stroke();
    doc.moveDown(0.6);

    const tva = Number(f.montant_ttc) - Number(f.montant_ht);
    const row = (a, b, bold) => {
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10).fillColor('#111')
         .text(a, 330, y, { width: 120 }).text(b, 450, y, { width: 89, align: 'right' });
      doc.y = y + (bold ? 20 : 16);
    };
    if (pro.tva_franchise) {
      row('Total net à payer', eur(f.montant_ttc), true);
    } else {
      row('Total HT', eur(f.montant_ht));
      row(`TVA ${Number(f.tva_pct)} %`, eur(tva));
      row('Total TTC', eur(f.montant_ttc), true);
    }
    doc.font('Helvetica').moveDown(1);

    doc.x = 56;
    doc.fontSize(10).fillColor('#166534').text(`Facture acquittée : payée en ligne par carte bancaire le ${dt(s.paye_at)}.`);
    doc.moveDown(0.6).fontSize(8).fillColor('#777');
    if (pro.tva_franchise) doc.text('TVA non applicable, art. 293 B du CGI.');
    doc.text('Paiement comptant : aucun escompte. En cas de retard, pénalités et indemnité forfaitaire de recouvrement de 40 € (art. L441-10 du Code de commerce) — sans objet, facture acquittée.');
    if (pro.mediateur) doc.text('Médiateur de la consommation : ' + pro.mediateur.replace(/\s*\n\s*/g, ', '));
    doc.end();
  });
}

module.exports = { renderFacturePdf };
