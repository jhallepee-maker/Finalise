const db = require('../db');
const meetch = require('../lib/meetch');

// Idempotent : souscrit chez Meetch une seule fois, après paiement confirmé et si le client a choisi « oui ».
async function subscribeDevis(devisId) {
  if (!meetch.enabled()) return null;
  const { rows } = await db.query('SELECT * FROM devis WHERE id=$1', [devisId]);
  const d = rows[0];
  if (!d || d.assurance_choix !== 'oui' || d.meetch_subscription_id || d.statut !== 'paye') return null;
  try {
    const r = await meetch.subscribe(d, Array.isArray(d.dates) ? d.dates : []);
    await db.query(`UPDATE devis SET meetch_subscription_id=$2, meetch_status='subscribed', meetch_error=NULL WHERE id=$1`, [d.id, r.id]);
    return r;
  } catch (e) {
    console.error('[meetch] souscription', d.id, e.message);
    await db.query(`UPDATE devis SET meetch_status='error', meetch_error=$2 WHERE id=$1`, [d.id, e.message.slice(0, 500)]);
    throw e; // le webhook Stripe renverra 500 → rejeu
  }
}
module.exports = { subscribeDevis };
