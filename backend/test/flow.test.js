// Parcours critique : création → signature → facture. Nécessite DATABASE_URL (base de test).
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test';
const run = require('../db/migrate');
const db = require('../db');
const { createDevis, getPublicDevis, signDevis } = require('../services/devisService');
const { issueFacture } = require('../services/factureService');

let pro, fr, en;
const D = [{ date: '2030-03-15', mode: 'journee' }, { date: '2030-03-16', mode: 'creneau', debut: '08:00', fin: '12:00' }];
const email = `t${Date.now()}@test.fr`;

async function cgv(l) {
  const buf = Buffer.from(`%PDF-1.4 ${l} ${crypto.randomBytes(8).toString('hex')} ${'x'.repeat(200)}`);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const { rows } = await db.query(
    'INSERT INTO cgv_versions(pro_id,nom,hash,taille,pdf,langue) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [pro, l + '.pdf', hash, buf.length, buf, l]);
  return rows[0].id;
}

test.before(async () => {
  await run();
  const { rows } = await db.query(
    `INSERT INTO pros(email,password_hash,nom,adresse,siret) VALUES($1,'x','Test','1 rue','12345678901234') RETURNING id`, [email]);
  pro = rows[0].id;
  fr = await cgv('fr'); en = await cgv('en');
  await db.query('UPDATE pros SET cgv_version_id=$2, cgv_en_version_id=$3 WHERE id=$1', [pro, fr, en]);
});
test.after(async () => { await db.query('DELETE FROM pros WHERE id=$1', [pro]).catch(() => {}); await db.end?.(); });

const base = { client: { nom: 'Jean', email: 'j@t.fr', tel: '0600000000' }, nom_signe: 'Jean', participants_nb: 2,
  cases: { accept_devis: true, accept_cgv: true, accept_rgpd: true, accept_signature: true } };

test('devis à montant unique, TVA non applicable, CGV anglaises', async () => {
  const d = await createDevis(pro, { objet: 'Sortie', montant: 250, tva_mode: 'non_applicable', cgv_langue: 'en', dates: D, participants_max: 4, champs_requis: ['nom', 'email', 'tel'] });
  const pub = await getPublicDevis(d.token_unique);
  assert.equal(Number(pub.montant_ttc), 250);
  assert.equal(pub.tva_franchise, true);
  assert.equal(pub.cgv_langue, 'en');
  assert.equal(pub.lignes.length, 1);
  assert.equal(pub.dates.length, 2);
});

test('TVA comprise : HT + TVA = TTC exact', async () => {
  const d = await createDevis(pro, { objet: 'x', montant: 99.99, tva_mode: 'incluse', tva_pct: 20, dates: D, participants_max: 2, champs_requis: ['nom'] });
  assert.equal(Number(d.montant_ttc), 99.99);
  assert.ok(Math.abs(Number(d.montant_ht) * 1.2 - 99.99) < 0.02);
});

test('un nom client est exigé sauf « à compléter »', async () => {
  await assert.rejects(createDevis(pro, { objet: 'x', montant: 10, tva_mode: 'incluse', dates: D, participants_max: 2, champs_requis: [] }), /nom/i);
});

test('signature : RGPD, toutes les dates, participants', async () => {
  const d = await createDevis(pro, { objet: 'S', montant: 100, tva_mode: 'non_applicable', dates: D, participants_max: 4, champs_requis: ['nom'] });
  const pub = await getPublicDevis(d.token_unique);
  const noRgpd = { ...base, cases: { ...base.cases, accept_rgpd: false }, dates_confirmees: pub.dates };
  await assert.rejects(signDevis(d.token_unique, noRgpd, '1.1.1.1', 'ua'), /cases/i);
  await assert.rejects(signDevis(d.token_unique, { ...base, dates_confirmees: [pub.dates[0]] }, '1.1.1.1', 'ua'), /dates/i);
  await assert.rejects(signDevis(d.token_unique, { ...base, participants_nb: 9, dates_confirmees: pub.dates }, '1.1.1.1', 'ua'), /participants/i);
  const ok = await signDevis(d.token_unique, { ...base, dates_confirmees: pub.dates }, '1.1.1.1', 'ua');
  assert.ok(ok.hash);
  await assert.rejects(signDevis(d.token_unique, { ...base, dates_confirmees: pub.dates }, '1.1.1.1', 'ua'), /déjà/i);
  // facture idempotente
  await db.query("UPDATE devis SET statut='paye' WHERE id=$1", [d.id]);
  const f1 = await issueFacture(d.id), f2 = await issueFacture(d.id);
  assert.equal(f1.numero, f2.numero);
  assert.equal(f1.snapshot.pro.tva_franchise, true);
});

test('CGV demandée en langue absente refusée', async () => {
  await db.query('UPDATE pros SET cgv_en_version_id=NULL WHERE id=$1', [pro]);
  await assert.rejects(createDevis(pro, { objet: 'x', montant: 10, tva_mode: 'incluse', cgv_langue: 'en', dates: D, participants_max: 2, champs_requis: ['nom'] }), /anglais/i);
});
