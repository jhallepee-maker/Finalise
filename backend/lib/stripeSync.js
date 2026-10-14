const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db     = require('../db');

// Synchronise charges_enabled / details_submitted depuis Stripe vers la base.
// Retourne les flags, ou null si le compte est injoignable (clé d'une autre plateforme, etc.).
async function syncAccount(proId, accountId) {
  try {
    const a = await stripe.accounts.retrieve(accountId);
    const flags = { charges_enabled: !!a.charges_enabled, details_submitted: !!a.details_submitted };
    await db.query(
      'UPDATE pros SET charges_enabled=$1, details_submitted=$2 WHERE id=$3',
      [flags.charges_enabled, flags.details_submitted, proId]
    );
    return flags;
  } catch (e) {
    console.error('[stripeSync]', e.message);
    return null;
  }
}

module.exports = { syncAccount };
