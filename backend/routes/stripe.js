const express = require('express');
const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db      = require('../db');
const { verifyJWT } = require('../middleware/auth');
const { syncAccount } = require('../lib/stripeSync');
const router  = express.Router();

const COMMISSION_PCT = 0.01; // 1% Joseph

// POST /api/stripe/onboard — onboarding Stripe Connect Express pour un pro
// Réutilise le compte existant (pas de doublon si le pro clique deux fois ou reprend plus tard).
router.post('/onboard', verifyJWT, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT stripe_account_id FROM pros WHERE id=$1', [req.user.id]);
    let accountId = rows[0]?.stripe_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'FR',
        email: req.user.email,
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      });
      accountId = account.id;
      await db.query('UPDATE pros SET stripe_account_id=$1 WHERE id=$2', [accountId, req.user.id]);
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.FRONTEND_URL}/?stripe=refresh`,
      return_url:  `${process.env.FRONTEND_URL}/?stripe=ok`,
      type: 'account_onboarding',
    });
    res.json({ url: link.url });
  } catch (e) {
    console.error('[onboard]', e.message);
    res.status(500).json({ error: "Impossible de lancer la connexion Stripe pour l'instant. Réessayez dans quelques minutes." });
  }
});

// GET /api/stripe/status — état du compte Stripe du pro (resynchronisé à la demande)
router.get('/status', verifyJWT, async (req, res) => {
  const { rows } = await db.query(
    'SELECT stripe_account_id, charges_enabled, details_submitted FROM pros WHERE id=$1', [req.user.id]
  );
  const p = rows[0] || {};
  if (!p.stripe_account_id) return res.json({ connected: false, charges_enabled: false, details_submitted: false });
  const flags = (await syncAccount(req.user.id, p.stripe_account_id)) || p;
  res.json({ connected: true, charges_enabled: !!flags.charges_enabled, details_submitted: !!flags.details_submitted });
});

// POST /api/stripe/create-payment-intent — client prêt à payer
router.post('/create-payment-intent', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token requis' });

  const { rows } = await db.query(
    `SELECT d.*, p.stripe_account_id, p.charges_enabled FROM devis d JOIN pros p ON d.pro_id=p.id
     WHERE d.token_unique=$1`, [token]
  );
  if (!rows.length) return res.status(404).json({ error: 'Devis introuvable' });
  const d = rows[0];
  if (d.statut !== 'signe') return res.status(400).json({ error: 'Devis non signé' });
  if (d.expire_at && new Date(d.expire_at) < new Date()) return res.status(410).json({ error: 'Lien expiré' });
  if (!d.stripe_account_id) return res.status(400).json({ error: 'Pro non connecté à Stripe' });

  // Le pro doit avoir terminé son onboarding (re-vérifié auprès de Stripe si la base dit non)
  let chargesEnabled = d.charges_enabled;
  if (!chargesEnabled) {
    const flags = await syncAccount(d.pro_id, d.stripe_account_id);
    chargesEnabled = !!flags?.charges_enabled;
  }
  if (!chargesEnabled)
    return res.status(409).json({ error: "Le prestataire n'a pas terminé la configuration du paiement" });

  const montant_centimes = Math.round(Number(d.montant_ttc) * 100);
  const commission = Math.round(montant_centimes * COMMISSION_PCT);
  const opts = { stripeAccount: d.stripe_account_id };

  try {
    // Réutiliser le PaymentIntent existant (évite d'en créer un à chaque rechargement de page)
    if (d.stripe_payment_intent) {
      try {
        const existing = await stripe.paymentIntents.retrieve(d.stripe_payment_intent, opts);
        const reusable = ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(existing.status);
        if (reusable && existing.amount === montant_centimes) {
          return res.json({ client_secret: existing.client_secret, stripe_account: d.stripe_account_id });
        }
      } catch (_) { /* introuvable → on en recrée un */ }
    }

    // Direct charge : le PaymentIntent vit sur le compte du pro (marchand officiel,
    // paie les frais Stripe, gère litiges/remboursements). La commission reste prélevée.
    const pi = await stripe.paymentIntents.create(
      {
        amount: montant_centimes,
        currency: 'eur',
        application_fee_amount: commission,
        metadata: { devis_id: d.id, token },
      },
      opts
    );
    await db.query('UPDATE devis SET stripe_payment_intent=$1 WHERE id=$2', [pi.id, d.id]);
    res.json({ client_secret: pi.client_secret, stripe_account: d.stripe_account_id });
  } catch (e) {
    console.error('[create-payment-intent]', e.message);
    res.status(500).json({ error: 'Erreur lors de la préparation du paiement' });
  }
});

// Le webhook /api/stripe/webhook est géré dans stripeWebhook.js
// et monté dans server.js AVANT express.json() pour recevoir le body raw.

module.exports = router;
