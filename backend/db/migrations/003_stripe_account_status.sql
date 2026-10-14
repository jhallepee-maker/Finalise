-- Migration 003 : suivi de l'onboarding Stripe + réutilisation du PaymentIntent
ALTER TABLE pros   ADD COLUMN IF NOT EXISTS charges_enabled   BOOLEAN DEFAULT FALSE;
ALTER TABLE pros   ADD COLUMN IF NOT EXISTS details_submitted BOOLEAN DEFAULT FALSE;
ALTER TABLE devis  ADD COLUMN IF NOT EXISTS stripe_payment_intent VARCHAR(255);
