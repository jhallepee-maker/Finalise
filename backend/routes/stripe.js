const express = require('express');
const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db      = require('../db');
const { verifyJWT } = require('../middleware/auth');
const router  = express.Router();

const COMMISSION_PCT = 0.01; // 1% Joseph

// POST /api/stripe/onboard — onboarding Stripe Connect Express pour un pro
router.post('/onboard', verifyJWT, async (req, res) => {
  try {
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'FR',
      email: req.user.email,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    });
    await db.query('UPDATE pros SET stripe_account_id=$1 WHERE id=$2', [account.id, req.user.id]);

    const link = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.FRONTEND_URL}/dashboard?stripe=refresh`,
      return_url:  `${process.env.FRONTEND_URL}/dashboard?stripe=ok`,
      type: 'account_onboarding',
    });
    res.json({ url: link.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/stripe/create-payment-intent — client prêt à payer
router.post('/create-payment-intent', async (req, res) => {
  const { token } = req.body;
  const { rows } = await db.query(
    `SELECT d.*, p.stripe_account_id FROM devis d JOIN pros p ON d.pro_id=p.id
     WHERE d.token_unique=$1`, [token]
  );
  if (!rows.length) return res.status(404).json({ error: 'Devis introuvable' });
  const d = rows[0];
  if (d.statut !== 'signe') return res.status(400).json({ error: 'Devis non signé' });
  if (!d.stripe_account_id) return res.status(400).json({ error: 'Pro non connecté à Stripe' });

  const montant_centimes = Math.round(d.montant_ttc * 100);
  const commission = Math.round(montant_centimes * COMMISSION_PCT);

  try {
    const pi = await stripe.paymentIntents.create({
      amount: montant_centimes,
      currency: 'eur',
      application_fee_amount: commission,
      transfer_data: { destination: d.stripe_account_id },
      metadata: { devis_id: d.id, token },
    });
    res.json({ client_secret: pi.client_secret });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/stripe/webhook — Stripe confirme le paiement
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
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
    const montant = pi.amount / 100;
    const commission = pi.application_fee_amount / 100;
    await db.query(`UPDATE devis SET statut='paye' WHERE id=$1`, [devis_id]);
    await db.query(
      `INSERT INTO paiements (devis_id, stripe_payment_intent, montant_ttc, commission_joseph, montant_net_pro, statut, paye_at)
       VALUES ($1,$2,$3,$4,$5,'succeeded',NOW())`,
      [devis_id, pi.id, montant, commission, montant - commission]
    );
  }
  res.json({ received: true });
});

module.exports = router;
