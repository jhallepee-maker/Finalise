// Parcours HTTP complet : inscription → devis → signature → assurance → paiement (Stripe simulé) → webhook → facture.
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
process.env.JWT_SECRET = 'test'; process.env.STRIPE_SECRET_KEY = 'sk_test_x'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
process.env.MEETCH_ENABLED = '1'; process.env.FRONTEND_URL = 'http://localhost';
delete process.env.MEETCH_API_KEY; delete process.env.RESEND_API_KEY;

// Stripe simulé (aucun réseau)
const intents = {};
const fakeStripe = () => ({
  paymentIntents: {
    create: async (p) => { const id = 'pi_' + Math.random().toString(36).slice(2); intents[id] = { id, status: 'requires_payment_method', client_secret: id + '_secret', ...p }; return intents[id]; },
    retrieve: async (id) => { if (!intents[id]) throw new Error('nope'); return { ...intents[id], latest_charge: null }; },
  },
  accounts: { retrieve: async () => ({ charges_enabled: true, details_submitted: true }) },
  webhooks: { constructEvent: (body) => JSON.parse(body.toString()) },
});
const orig = Module._load;
Module._load = function (req, ...a) { return req === 'stripe' ? fakeStripe : orig.call(this, req, ...a); };

const run = require('../db/migrate');
const db = require('../db');
const app = require('../server');
let srv, base, pro;
const email = `e2e${Date.now()}@test.fr`;
const api = async (method, path, body, token) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, body: ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
};

test.before(async () => { await run(); srv = app.listen(0); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(async () => { if (pro) await db.query('DELETE FROM pros WHERE id=$1', [pro]).catch(() => {}); srv.close(); await db.end?.(); });

test('parcours complet jusqu’à la facture, avec assurance', async () => {
  const reg = await api('POST', '/api/auth/register', { email, password: 'motdepasse1', nom: 'Hallépée', prenom: 'Joseph', siret: '12345678901234', accept_cgu: true });
  assert.equal(reg.status, 201); pro = reg.body.pro.id; const jwt = reg.body.token;
  await db.query(`UPDATE pros SET stripe_account_id='acct_test', charges_enabled=true, adresse='1 rue', code_postal='74000', ville='Annecy' WHERE id=$1`, [pro]);

  // devis refusé sans CGV, accepté après envoi du PDF
  const sans = await api('POST', '/api/devis', { objet: 'X', montant: 10 }, jwt);
  assert.equal(sans.status, 422);
  const up = await fetch(base + '/api/profil/cgv?langue=fr&nom=cgv.pdf', { method: 'PUT', headers: { 'content-type': 'application/pdf', authorization: 'Bearer ' + jwt }, body: Buffer.from('%PDF-1.4 ' + 'x'.repeat(300)) });
  assert.equal(up.status, 200);

  const cr = await api('POST', '/api/devis', { objet: 'Journée guide', montant: 300, tva_mode: 'non_applicable', dates: [{ date: '2031-07-10', mode: 'journee' }], participants_max: 2, champs_requis: ['nom', 'email'] }, jwt);
  assert.equal(cr.status, 201, JSON.stringify(cr.body)); const token = cr.body.token_unique;

  const pub = await api('GET', '/api/devis/token/' + token);
  assert.equal(pub.status, 200); assert.equal(Number(pub.body.montant_ttc), 300);

  // paiement refusé avant signature
  assert.equal((await api('POST', '/api/stripe/create-payment-intent', { token })).status, 400);

  const sg = await api('POST', '/api/paiement/signer', { token, client: { nom: 'Marie Curie', email: 'm@c.fr', tel: '0600000000' }, nom_signe: 'Marie Curie', participants_nb: 2,
    dates_confirmees: pub.body.dates.map(d => ({ date: d.date, mode: d.mode, debut: d.debut, fin: d.fin })),
    cases: { accept_devis: true, accept_cgv: true, accept_rgpd: true, accept_signature: true } });
  assert.equal(sg.status, 200, JSON.stringify(sg.body));

  // assurance : réponse obligatoire avant paiement
  const off = await api('GET', '/api/assurance/' + token);
  assert.equal(off.body.enabled, true); assert.equal(off.body.prime, 13.5);
  assert.equal((await api('POST', '/api/stripe/create-payment-intent', { token })).status, 409);
  assert.equal((await api('POST', '/api/assurance/' + token, { choix: 'peut-être' })).status, 400);
  assert.equal((await api('POST', '/api/assurance/' + token, { choix: 'oui' })).body.prime, 13.5);

  const pi = await api('POST', '/api/stripe/create-payment-intent', { token });
  assert.equal(pi.status, 200, JSON.stringify(pi.body));
  const intent = Object.values(intents).pop();
  assert.equal(intent.amount, 31350);                 // 300 + 13,50 de prime
  assert.equal(intent.application_fee_amount, 300);   // 1 % de la prestation seulement

  const ev = { type: 'payment_intent.succeeded', account: 'acct_test', data: { object: { id: intent.id, amount: intent.amount, application_fee_amount: 300, metadata: intent.metadata } } };
  for (let i = 0; i < 2; i++) { // rejeu Stripe : idempotent
    const wh = await fetch(base + '/api/stripe/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': 'x' }, body: JSON.stringify(ev) });
    assert.equal(wh.status, 200);
  }
  const d = (await db.query('SELECT statut, meetch_status, meetch_subscription_id FROM devis WHERE token_unique=$1', [token])).rows[0];
  assert.equal(d.statut, 'paye'); assert.equal(d.meetch_status, 'subscribed'); assert.ok(d.meetch_subscription_id);
  assert.equal((await db.query(`SELECT count(*)::int n FROM paiements p JOIN devis d ON d.id=p.devis_id WHERE d.token_unique=$1`, [token])).rows[0].n, 1);

  for (const p of ['facture', 'justificatif']) {
    const r = await api('GET', `/api/paiement/${p}/${token}`);
    assert.equal(r.status, 200, p); assert.equal(r.body.slice(0, 5).toString(), '%PDF-');
  }
  assert.equal((await api('GET', '/api/devis/' + cr.body.id, null, jwt)).status, 200);
});
