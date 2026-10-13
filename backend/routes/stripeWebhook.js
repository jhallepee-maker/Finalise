const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db     = require('../db');

// Handler brut pour POST /api/stripe/webhook
// Monté dans server.js AVANT express.json() pour recevoir le body raw
module.exports = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).send(`Webhook error: ${e.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const devis_id = pi.metadata.devis_id;
    const montant  = pi.amount / 100;
    const commission = (pi.application_fee_amount || 0) / 100;
    // Frais Stripe estimés : 1.5% + 0.25€ (Connect standard Europe)
    const stripe_fees = parseFloat(((montant * 0.015) + 0.25).toFixed(2));

    await db.query(`UPDATE devis SET statut='paye' WHERE id=$1`, [devis_id]);
    await db.query(
      `INSERT INTO paiements
         (devis_id, stripe_payment_intent, montant_ttc, commission_joseph, stripe_fees, montant_net_pro, statut, paye_at)
       VALUES ($1,$2,$3,$4,$5,$6,'succeeded',NOW())
       ON CONFLICT (stripe_payment_intent) DO NOTHING`,
      [devis_id, pi.id, montant, commission, stripe_fees, montant - commission - stripe_fees]
    );
  }

  res.json({ received: true });
};
