-- Migration 001 : contrainte UNIQUE sur stripe_payment_intent
-- Nécessaire pour le ON CONFLICT du webhook Stripe
ALTER TABLE paiements
  ADD CONSTRAINT IF NOT EXISTS paiements_stripe_payment_intent_key
  UNIQUE (stripe_payment_intent);
