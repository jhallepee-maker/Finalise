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

test('santé et robustesse', async () => {
  assert.equal((await api('GET', '/health')).status, 200);
  assert.equal((await api('GET', '/health/db')).body.db, 'ok');
  const bad = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{pas du json' });
  assert.equal(bad.status, 400);
});

test('mode bureau : invitations avec consentement, agir pour un guide, cloisonnement', async () => {
  const mk = async (tag) => {
    const e = `org${tag}${Date.now()}@test.fr`;
    const r = await api('POST', '/api/auth/register', { email: e, password: 'motdepasse1', nom: 'N' + tag, accept_cgu: true });
    return { id: r.body.pro.id, email: e, jwt: r.body.token };
  };
  const [boss, guide, sec, other] = [await mk('b'), await mk('g'), await mk('s'), await mk('o')];
  const ids = [boss.id, guide.id, sec.id, other.id];
  try {
    const org = await api('POST', '/api/org', { nom: 'Bureau des guides' }, boss.jwt);
    assert.equal(org.status, 201);
    assert.equal((await api('POST', '/api/org', { nom: 'Autre' }, boss.jwt)).status, 409);

    // seul l'admin invite ; rôle admin non invitable
    assert.equal((await api('POST', '/api/org/invitations', { email: guide.email, role: 'guide' }, guide.jwt)).status, 403);
    assert.equal((await api('POST', '/api/org/invitations', { email: guide.email, role: 'admin' }, boss.jwt)).status, 400);
    const ig = (await api('POST', '/api/org/invitations', { email: guide.email, role: 'guide' }, boss.jwt)).body.code;
    const is = (await api('POST', '/api/org/invitations', { email: sec.email, role: 'secretaire' }, boss.jwt)).body.code;

    // une invitation ne sert qu'au compte invité
    assert.equal((await api('POST', '/api/org/accept', { code: ig }, other.jwt)).status, 404);
    assert.equal((await api('POST', '/api/org/accept', { code: ig }, guide.jwt)).status, 200);
    assert.equal((await api('POST', '/api/org/accept', { code: is }, sec.jwt)).status, 200);
    assert.equal((await api('POST', '/api/org/accept', { code: ig }, guide.jwt)).status, 409);

    // la secrétaire a besoin des CGV du guide pour créer un devis à son nom
    await db.query(`UPDATE pros SET stripe_account_id='acct_g', charges_enabled=true, siret='12345678901234', adresse='1 rue', code_postal='74000', ville='Annecy' WHERE id=$1`, [guide.id]);
    const up = await fetch(base + '/api/profil/cgv?langue=fr&nom=cgv.pdf', { method: 'PUT', headers: { 'content-type': 'application/pdf', authorization: 'Bearer ' + guide.jwt }, body: Buffer.from('%PDF-1.4 ' + 'g'.repeat(300)) });
    assert.equal(up.status, 200);

    const asGuide = (jwt, who) => ({ authorization: 'Bearer ' + jwt, 'content-type': 'application/json', 'x-act-as': who });
    const post = (headers, body) => fetch(base + '/api/devis', { method: 'POST', headers, body: JSON.stringify(body) });
    const dv = await post(asGuide(sec.jwt, guide.id), { objet: 'Sortie bureau', montant: 120, dates: [{ date: '2031-08-01', mode: 'journee' }], participants_max: 2 });
    assert.equal(dv.status, 201, JSON.stringify(await dv.clone().json()));
    const created = await dv.json();
    const row = (await db.query('SELECT pro_id, created_by FROM devis WHERE id=$1', [created.id])).rows[0];
    assert.equal(row.pro_id, guide.id); assert.equal(row.created_by, sec.id);

    // la secrétaire voit les devis du guide ; le guide aussi ; un tiers non
    const list = await (await fetch(base + '/api/devis', { headers: { authorization: 'Bearer ' + sec.jwt, 'x-act-as': guide.id } })).json();
    assert.ok(list.some(d => d.id === created.id));
    const own = await api('GET', '/api/devis', null, guide.jwt);
    assert.ok(own.body.some(d => d.id === created.id));
    assert.equal((await post(asGuide(other.jwt, guide.id), { objet: 'x', montant: 1 })).status, 403);
    // sans l'en-tête, la secrétaire ne voit que ses propres devis
    assert.equal((await api('GET', '/api/devis', null, sec.jwt)).body.length, 0);
    // un guide ne peut pas agir pour la secrétaire ni pour le patron
    assert.equal((await post(asGuide(guide.jwt, boss.id), { objet: 'x', montant: 1 })).status, 403);
    assert.equal((await post(asGuide(boss.jwt, sec.id), { objet: 'x', montant: 1 })).status, 403);
    // agir pour soi-même reste possible
    assert.equal((await fetch(base + '/api/devis', { headers: { authorization: 'Bearer ' + boss.jwt, 'x-act-as': boss.id } })).status, 200);

    // départ : le dernier admin ne peut pas partir ; la secrétaire peut se retirer
    assert.equal((await api('DELETE', '/api/org/membres/' + boss.id, null, boss.jwt)).status, 409);
    assert.equal((await api('DELETE', '/api/org/membres/' + sec.id, null, sec.jwt)).status, 200);
    assert.equal((await post(asGuide(sec.jwt, guide.id), { objet: 'x', montant: 1 })).status, 403);
    const o = await api('GET', '/api/org', null, boss.jwt);
    assert.equal(o.body.membres.length, 2);
  } finally {
    await db.query('DELETE FROM devis WHERE pro_id = ANY($1)', [ids]).catch(() => {});
    await db.query('UPDATE pros SET org_id=NULL WHERE id = ANY($1)', [ids]);
    await db.query('DELETE FROM organisations WHERE created_by = ANY($1)', [ids]);
    await db.query('DELETE FROM pros WHERE id = ANY($1)', [ids]).catch(() => {});
  }
});

test('mode bureau : le profil du guide est lisible mais jamais modifiable par la secrétaire', async () => {
  const mk = async (tag) => { const e = `p${tag}${Date.now()}@test.fr`; const r = await api('POST', '/api/auth/register', { email: e, password: 'motdepasse1', nom: 'P' + tag, accept_cgu: true }); return { id: r.body.pro.id, email: e, jwt: r.body.token }; };
  const [boss, guide] = [await mk('b'), await mk('g')];
  try {
    await api('POST', '/api/org', { nom: 'B' }, boss.jwt);
    const c = (await api('POST', '/api/org/invitations', { email: guide.email, role: 'guide' }, boss.jwt)).body.code;
    await api('POST', '/api/org/accept', { code: c }, guide.jwt);
    const h = { authorization: 'Bearer ' + boss.jwt, 'content-type': 'application/json', 'x-act-as': guide.id };
    assert.equal((await (await fetch(base + '/api/profil', { headers: h })).json()).id, guide.id);        // lecture : profil du guide
    await fetch(base + '/api/profil', { method: 'PUT', headers: h, body: JSON.stringify({ nom: 'PIRATE' }) });  // écriture : ignorée côté guide
    assert.equal((await db.query('SELECT nom FROM pros WHERE id=$1', [guide.id])).rows[0].nom, 'Pg');
    const me = await api('GET', '/api/auth/me', null, boss.jwt);
    assert.equal(me.body.id, boss.id);
  } finally {
    await db.query('UPDATE pros SET org_id=NULL WHERE id = ANY($1)', [[boss.id, guide.id]]);
    await db.query('DELETE FROM organisations WHERE created_by=$1', [boss.id]);
    await db.query('DELETE FROM pros WHERE id = ANY($1)', [[boss.id, guide.id]]).catch(() => {});
  }
});

test('push : abonnement, envoi, nettoyage des appareils expirés', async () => {
  const keys = require('web-push').generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = keys.publicKey; process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  const wp = require('web-push'); const calls = [];
  const realSend = wp.sendNotification;
  wp.sendNotification = async (sub, payload) => { calls.push({ ep: sub.endpoint, payload: JSON.parse(payload) }); if (sub.endpoint.includes('gone')) { const e = new Error('gone'); e.statusCode = 410; throw e; } };
  const e = `push${Date.now()}@test.fr`;
  const r = await api('POST', '/api/auth/register', { email: e, password: 'motdepasse1', nom: 'Pu', accept_cgu: true });
  const id = r.body.pro.id, jwt = r.body.token;
  try {
    assert.equal((await api('GET', '/api/push/key')).body.key, keys.publicKey);
    assert.equal((await api('POST', '/api/push/subscribe', { subscription: { endpoint: 'http://non-https', keys: {} } }, jwt)).status, 400);
    assert.equal((await api('POST', '/api/push/subscribe', { subscription: { endpoint: 'https://push.example/ok', keys: { p256dh: 'a', auth: 'b' } } })).status, 401);
    assert.equal((await api('POST', '/api/push/subscribe', { subscription: { endpoint: 'https://push.example/ok', keys: { p256dh: 'a', auth: 'b' } } }, jwt)).status, 201);
    assert.equal((await api('POST', '/api/push/subscribe', { subscription: { endpoint: 'https://push.example/gone', keys: { p256dh: 'a', auth: 'b' } } }, jwt)).status, 201);
    const t = await api('POST', '/api/push/test', null, jwt);
    assert.equal(t.status, 200); assert.equal(t.body.sent, 1);
    assert.equal(calls.length, 2);
    assert.equal((await db.query('SELECT count(*)::int n FROM push_subscriptions WHERE pro_id=$1', [id])).rows[0].n, 1); // l'appareil expiré est supprimé
    // une notification de paiement atteint bien l'appareil restant
    const { notifyPaid } = require('../lib/notifications');
    const { rows } = await db.query(`INSERT INTO devis (pro_id, token_unique, objet, description, montant_ttc, montant_ht, statut, client_nom) VALUES ($1,$2,'Sortie','Sortie',250,250,'paye','Marie') RETURNING id`, [id, 'tk' + Date.now()]);
    calls.length = 0; await notifyPaid(rows[0].id); assert.ok(calls.some(c => /Marie a payé/.test(c.payload.body)), JSON.stringify(calls));
  } finally {
    wp.sendNotification = realSend; delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
    await db.query('DELETE FROM devis WHERE pro_id=$1', [id]).catch(() => {});
    await db.query('DELETE FROM pros WHERE id=$1', [id]).catch(() => {});
  }
});

test('devis avec beaucoup de dates (résumé long) créé sans erreur', async () => {
  const e = `dates${Date.now()}@test.fr`;
  const r = await api('POST', '/api/auth/register', { email: e, password: 'motdepasse1', nom: 'Da', accept_cgu: true });
  const id = r.body.pro.id, jwt = r.body.token;
  try {
    await db.query(`UPDATE pros SET siret='12345678901234', adresse='1 rue', code_postal='74000', ville='Annecy' WHERE id=$1`, [id]);
    await fetch(base + '/api/profil/cgv?langue=fr&nom=c.pdf', { method: 'PUT', headers: { 'content-type': 'application/pdf', authorization: 'Bearer ' + jwt }, body: Buffer.from('%PDF-1.4 ' + 'x'.repeat(300)) });
    const dates = Array.from({ length: 8 }, (_, i) => ({ date: `2031-07-${String(10 + i).padStart(2, '0')}`, mode: 'creneau', debut: '04:00', fin: '15:00' }));
    const c = await api('POST', '/api/devis', { objet: 'Traversée longue', montant: 900, dates, participants_max: 4 }, jwt);
    assert.equal(c.status, 201, JSON.stringify(c.body));
    // médiateur : enregistré dans le profil puis exposé au client sur la page publique
    const pr = await api('PUT', '/api/profil', { nom: 'Da', siret: '12345678901234', mediateur: 'Médiateur X, 1 rue Y, mediateur-x.fr' }, jwt);
    assert.equal(pr.status, 200, JSON.stringify(pr.body));
    assert.equal(pr.body.mediateur, 'Médiateur X, 1 rue Y, mediateur-x.fr');
    const pub = await api('GET', '/api/devis/token/' + c.body.token_unique);
    assert.equal(pub.body.mediateur, 'Médiateur X, 1 rue Y, mediateur-x.fr', JSON.stringify(pub.body).slice(0, 300));
  } finally {
    await db.query('DELETE FROM devis WHERE pro_id=$1', [id]).catch(() => {});
    await db.query('DELETE FROM pros WHERE id=$1', [id]).catch(() => {});
  }
});
