// Intégration Meetch (assurance annulation). Désactivée tant que MEETCH_ENABLED != '1'.
// Mode 'mock' (défaut sans clé) : aucune requête réseau. Mode 'live' : MEETCH_API_KEY + MEETCH_BASE_URL + MEETCH_PRODUCT_ID.
// À CONFIRMER avec Meetch (docs "Authentication" / "Premium calculation" non lues) : schéma d'auth, chemin du calcul de prime.
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

// Prime TTC pour un montant de prestation (en €). Repli sur un taux si l'API ne répond pas.
async function premium(montant) {
  const fallback = Math.max(Number(process.env.MEETCH_MIN || 2), Math.round(montant * RATE() * 100) / 100);
  if (!live()) return fallback;
  try {
    const r = await call('POST', '/v1/premium-calculation', { product_id: process.env.MEETCH_PRODUCT_ID, order_amount: montant, currency: 'EUR' });
    const p = Number(r.insurance_amount ?? r.premium);
    return Number.isFinite(p) && p > 0 ? p : fallback;
  } catch (e) { console.error('[meetch] prime:', e.message); return fallback; }
}

const iso = d => (d ? new Date(d).toISOString() : undefined);

// Corps de souscription (champs de la doc Meetch "Create a subscription")
function buildSubscription(d, dates) {
  const first = dates[0], last = dates[dates.length - 1];
  const ev = x => x && x.date ? `${x.date}T${(x.debut || '00:00')}:00` : undefined;
  const [prenom, ...reste] = String(d.client_nom || '').trim().split(/\s+/);
  return {
    order_date: iso(new Date()), product_id: process.env.MEETCH_PRODUCT_ID, order_reference: d.numero || d.id,
    currency: 'EUR', preferred_locale: d.cgv_langue === 'en' ? 'en' : 'fr',
    buyer_firstname: prenom || '', buyer_lastname: reste.join(' ') || prenom || '', buyer_email: d.client_email,
    order_amount: Number(d.montant_ttc), insurance_amount: Number(d.assurance_montant),
    contract_date_start: ev(first), contract_date_end: ev(last),
    items: [{ number: 1, label: d.objet || d.description || 'Prestation', price: Number(d.montant_ttc),
      insurance_amount: Number(d.assurance_montant), event_name: d.objet || 'Prestation',
      event_date_start: ev(first), event_date_end: ev(last), item_holder_name: d.client_nom }],
  };
}

async function subscribe(d, dates) {
  if (!live()) return { id: `mock_${d.id}`, mock: true };
  const r = await call('POST', '/v1/subscriptions', buildSubscription(d, dates));
  return { id: String(r.id ?? r.subscription_id ?? r.order_reference) };
}

module.exports = { enabled, live, premium, subscribe, buildSubscription };
