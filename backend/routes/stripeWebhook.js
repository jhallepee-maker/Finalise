const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db     = require('../db');
const { notifyPaid, fire } = require('../lib/notifications');

// Frais Stripe réels lus sur la balance_transaction du compte connecté (direct charge).
// Retourne null si indisponible → l'appelant retombe sur une estimation.
async function realStripeFee(piId, account) {
  try {
    const pi = await stripe.paymentIntents.retrieve(
      piId,
      { expand: ['latest_charge.balance_transaction'] },
      account ? { stripeAccount: account } : undefined
    );
    const bt = pi.latest_charge && pi.latest_charge.balance_transaction;
    if (!bt || !Array.isArray(bt.fee_details)) return null;
    const cents = bt.fee_details
      .filter(f => f.type === 'stripe_fee')
      .reduce((s, f) => s + f.amount, 0);
    return cents / 100;
  } catch (e) {
    console.error('[webhook] frais réels indisponibles:', e.message);
    return null;
  }
}

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

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        const devis_id = pi.metadata && pi.metadata.devis_id;
        if (!devis_id) break; // paiement qui ne vient pas de Finalise
        const montant    = pi.amount / 100;
        const commission = (pi.application_fee_amount || 0) / 100;
        const real = await realStripeFee(pi.id, event.account);
        // Estimation de repli : 1.5% + 0.25€ (cartes européennes)
        const stripe_fees = real != null ? real : parseFloat(((montant * 0.015) + 0.25).toFixed(2));

        // RETURNING ne renvoie une ligne qu'à la 1re transition → pas d'emails en double si Stripe rejoue l'événement
        const { rows: firstTime } = await db.query(
          `UPDATE devis SET statut='paye' WHERE id=$1 AND statut<>'paye' RETURNING id`, [devis_id]
        );
        await db.query(
          `INSERT INTO paiements
             (devis_id, stripe_payment_intent, montant_ttc, commission_joseph, stripe_fees, montant_net_pro, statut, paye_at)
           VALUES ($1,$2,$3,$4,$5,$6,'succeeded',NOW())
           ON CONFLICT (stripe_payment_intent) DO UPDATE SET
             montant_ttc=EXCLUDED.montant_ttc, commission_joseph=EXCLUDED.commission_joseph,
             stripe_fees=EXCLUDED.stripe_fees, montant_net_pro=EXCLUDED.montant_net_pro,
             statut='succeeded', paye_at=COALESCE(paiements.paye_at, NOW())`,
          [devis_id, pi.id, montant, commission, stripe_fees, montant - commission - stripe_fees]
        );
        if (firstTime.length) fire(notifyPaid, devis_id);
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        console.warn('[webhook] paiement échoué', pi.id, pi.last_payment_error && pi.last_payment_error.message);
        break;
      }

      case 'charge.refunded': {
        const ch = event.data.object;
        if (!ch.payment_intent) break;
        await db.query(
          `UPDATE paiements SET statut=$1 WHERE stripe_payment_intent=$2`,
          [ch.refunded ? 'refunded' : 'partially_refunded', ch.payment_intent]
        );
        break;
      }

      case 'charge.dispute.created': {
        const dp = event.data.object;
        if (!dp.payment_intent) break;
        console.warn('[webhook] litige ouvert', dp.id, dp.payment_intent);
        await db.query(
          `UPDATE paiements SET statut='dispute' WHERE stripe_payment_intent=$1`,
          [dp.payment_intent]
        );
        break;
      }

      case 'account.updated': {
        const a = event.data.object;
        await db.query(
          `UPDATE pros SET charges_enabled=$1, details_submitted=$2 WHERE stripe_account_id=$3`,
          [!!a.charges_enabled, !!a.details_submitted, a.id]
        );
        break;
      }

      default:
        break; // événement non géré : on acquitte quand même
    }
  } catch (e) {
    // 500 → Stripe réessaiera la livraison
    console.error('[webhook]', event.type, e.message);
    return res.status(500).send('Webhook handler error');
  }

  res.json({ received: true });
};
