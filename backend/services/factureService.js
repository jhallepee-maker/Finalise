const db = require('../db');
const { nextNumero } = require('../lib/numerotation');

// Émet la facture (acquittée) d'un devis payé. Idempotent : un devis = une facture.
// Le contenu est figé dans `snapshot` : une modification ultérieure du profil ne change pas la facture.
async function issueFacture(devisId) {
  return db.tx(async tx => {
    const { rows: ex } = await tx.query('SELECT * FROM factures WHERE devis_id=$1', [devisId]);
    if (ex[0]) return ex[0];

    const { rows } = await tx.query(
      `SELECT d.*, p.nom, p.prenom, p.activite, p.siret, p.adresse, p.code_postal, p.ville,
              p.telephone, p.email AS pro_email, p.tva_franchise
         FROM devis d JOIN pros p ON p.id=d.pro_id WHERE d.id=$1 FOR UPDATE OF d`, [devisId]
    );
    const d = rows[0];
    if (!d || d.statut !== 'paye') return null;

    const { rows: lr } = await tx.query(
      `SELECT description, quantite, prix_unitaire_ht FROM devis_lignes WHERE devis_id=$1 ORDER BY position`, [devisId]
    );
    const lignes = (lr.length ? lr : [{ description: d.description, quantite: 1, prix_unitaire_ht: d.montant_ht }])
      .map(l => ({ description: l.description, quantite: String(l.quantite), prix_unitaire_ht: String(l.prix_unitaire_ht) }));
    const { rows: pay } = await tx.query('SELECT paye_at FROM paiements WHERE devis_id=$1', [devisId]);

    const snapshot = {
      devis_numero: d.numero, objet: d.objet, date_prestation: d.date_prestation, lignes,
      pro: {
        nom: [d.prenom, d.nom].filter(Boolean).join(' '), activite: d.activite, siret: d.siret,
        adresse: [d.adresse, [d.code_postal, d.ville].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        telephone: d.telephone, email: d.pro_email, tva_franchise: !!d.tva_franchise,
      },
      client: { nom: d.client_nom, email: d.client_email, tel: d.client_tel, adresse: d.client_adresse },
      paye_at: pay[0]?.paye_at || new Date().toISOString(),
    };
    const numero = await nextNumero(tx, d.pro_id, 'facture');
    const { rows: fa } = await tx.query(
      `INSERT INTO factures (devis_id, pro_id, numero, montant_ht, tva_pct, montant_ttc, snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`,
      [devisId, d.pro_id, numero, d.montant_ht, d.tva_pct, d.montant_ttc, JSON.stringify(snapshot)]
    );
    return fa[0];
  });
}

async function getFactureByToken(token) {
  const { rows } = await db.query(
    `SELECT f.* FROM factures f JOIN devis d ON d.id=f.devis_id WHERE d.token_unique=$1`, [token]
  );
  return rows[0] || null;
}

module.exports = { issueFacture, getFactureByToken };
