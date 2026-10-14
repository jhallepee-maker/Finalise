-- Migration 010 : assurance annulation (Meetch). 100 % additif.
ALTER TABLE devis ADD COLUMN IF NOT EXISTS assurance_choix   VARCHAR(5);      -- 'oui' | 'non' | NULL (pas encore répondu)
ALTER TABLE devis ADD COLUMN IF NOT EXISTS assurance_montant NUMERIC(10,2);   -- prime TTC figée au choix
ALTER TABLE devis ADD COLUMN IF NOT EXISTS assurance_choix_at TIMESTAMPTZ;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS meetch_subscription_id VARCHAR(100);
ALTER TABLE devis ADD COLUMN IF NOT EXISTS meetch_status VARCHAR(30);         -- pending | subscribed | error | refunded
ALTER TABLE devis ADD COLUMN IF NOT EXISTS meetch_error TEXT;
