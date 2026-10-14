// Intégration Meetch (assurance annulation). Désactivée tant que MEETCH_ENABLED != '1'.
// Mode 'mock' (défaut sans clé) : aucune requête réseau. Mode 'live' : MEETCH_API_KEY + MEETCH_BASE_URL + MEETCH_PRODUCT_ID.
// Doc lue (docs.meetch.io) : auth = Authorization: Bearer <clé> ; POST {base}/v1/subscriptions ; webhooks signés HMAC-SHA256.
// MEETCH_BASE_URL = hôte sans /v1 (pré-prod : https://api.preprod.ticketing.meetch.io).
// La prime n'est PAS calculée par l'API : c'est au partenaire de l'appliquer (taux/tranches du contrat, sur le montant réellement payé).
const enabled = () => process.env.MEETCH_ENABLED === '1';
const live = () => !!(process.env.MEETCH_API_KEY && process.env.MEETCH_BASE_URL && process.env.MEETCH_PRODUCT_ID);
const RATE = () => Number(process.env.MEETCH_RATE || 0.045);

async function call(method, path, body) {
  const r = await fetch(process.env.MEETCH_BASE_URL.replace(/\/$/, '') + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.MEETCH_API_KEY}`,
      ...(process.env.MEETCH_ORGANIZATION_ID ? { Organization: process.env.MEETCH_ORGANIZATION_ID } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let json; try { json = JSON.parse(txt); } catch { json = { raw: txt }; }
  if (!r.ok) throw new Error(`Meetch ${r.status}: ${txt.slice(0, 300)}`);
  return json;
}

// Prime TTC pour un montant payé (en €) : taux du contrat (MEETCH_RATE) avec plancher MEETCH_MIN.
// À remplacer par les tranches réelles une fois le contrat signé.
async function premium(montant) {
  return Math.max(Number(process.env.MEETCH_MIN || 2), Math.round(montant * RATE() * 100) / 100);
}

const iso = d => (d ? new Date(d).toISOString() : undefined);

// Corps de souscription (champs de la doc Meetch "Create a subscription")
function buildSubscription(d, dates) {
  const first = dates[0], last = dates[dates.length - 1];
  const ev = x => x && x.date ? `${x.date}T${(x.debut || '00:00')}:00` : undefined;
  const [prenom, ...reste] = String(d.client_nom || '').trim().split(/\s+/);
  return {
    order_date: iso(new Date()), product_id: process.env.MEETCH_PRODUCT_ID, order_reference: d.numero || d.id,
    paid: true, currency: 'EUR', preferred_locale: d.cgv_langue === 'en' ? 'en_US' : 'fr_FR',
    buyer_firstname: (prenom || '').slice(0, 50), buyer_lastname: (reste.join(' ') || prenom || '').slice(0, 50), buyer_email: d.client_email, buyer_phone: d.client_tel || undefined,
    order_amount: Number(d.montant_ttc), insurance_amount: Number(d.assurance_montant),
    contract_date_start: ev(first), contract_date_end: ev(last),
    items: [{ number: String(d.numero || d.id), label: String(d.objet || d.description || 'Prestation').slice(0, 100), price: Number(d.montant_ttc),
      insurance_amount: Number(d.assurance_montant), event_name: String(d.objet || 'Prestation').slice(0, 100), event_country: 'FR',
      event_date_start: ev(first), event_date_end: ev(last), holder_name: d.client_nom, holder_email: d.client_email }],
  };
}

async function subscribe(d, dates) {
  if (!live()) return { id: `mock_${d.id}`, mock: true };
  const r = await call('POST', '/v1/subscriptions', buildSubscription(d, dates));
  const sub = r.subscription || r;
  return { id: String(sub.reference ?? sub.id ?? d.numero) };
}

module.exports = { enabled, live, premium, subscribe, buildSubscription };
