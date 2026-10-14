-- Migration 007 : CGV du pro en PDF, versionnées. Chaque signature fige la version acceptée (empreinte SHA-256).
CREATE TABLE IF NOT EXISTS cgv_versions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id     UUID NOT NULL REFERENCES pros(id),
  nom        VARCHAR(255) NOT NULL,
  hash       CHAR(64) NOT NULL,
  taille     INT NOT NULL,
  pdf        BYTEA NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (pro_id, hash)
);
ALTER TABLE pros  ADD COLUMN IF NOT EXISTS cgv_version_id UUID;  -- version actuellement proposée aux clients
ALTER TABLE devis ADD COLUMN IF NOT EXISTS cgv_version_id UUID;  -- version acceptée à la signature
