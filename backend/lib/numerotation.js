// Numérotation séquentielle par pro, par type et par année : DEV-2026-0001, FAC-2026-0001.
// `db` = le pool (db) ou un client de transaction (db.tx) : tout objet avec .query().
// L'upsert est atomique : deux créations simultanées n'obtiennent jamais le même numéro.
const PREFIX = { devis: 'DEV', facture: 'FAC' };

async function nextNumero(db, proId, type) {
  const annee = new Date().getFullYear();
  const { rows } = await db.query(
    `INSERT INTO numerotation (pro_id, type, annee, dernier) VALUES ($1,$2,$3,1)
     ON CONFLICT (pro_id, type, annee) DO UPDATE SET dernier = numerotation.dernier + 1
     RETURNING dernier`,
    [proId, type, annee]
  );
  return `${PREFIX[type]}-${annee}-${String(rows[0].dernier).padStart(4, '0')}`;
}

module.exports = { nextNumero };
