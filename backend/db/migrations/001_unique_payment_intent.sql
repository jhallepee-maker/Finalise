-- Migration 001 : contrainte UNIQUE sur stripe_payment_intent
-- Nécessaire pour le ON CONFLICT du webhook Stripe.
-- (ADD CONSTRAINT IF NOT EXISTS n'existe pas en PostgreSQL : on teste pg_constraint.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'paiements_stripe_payment_intent_key'
  ) THEN
    ALTER TABLE paiements
      ADD CONSTRAINT paiements_stripe_payment_intent_key UNIQUE (stripe_payment_intent);
  END IF;
END $$;
