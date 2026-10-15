-- Migration 011 : mode bureau (organisation, invitations, rôles). 100 % additif.
CREATE TABLE IF NOT EXISTS organisations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom        VARCHAR(255) NOT NULL,
  created_by UUID REFERENCES pros(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE pros ADD COLUMN IF NOT EXISTS org_id   UUID REFERENCES organisations(id) ON DELETE SET NULL;
ALTER TABLE pros ADD COLUMN IF NOT EXISTS org_role VARCHAR(12);   -- 'admin' | 'guide' | 'secretaire'
ALTER TABLE devis ADD COLUMN IF NOT EXISTS created_by UUID;       -- compte ayant saisi le devis (secrétaire ou le guide lui-même)
CREATE TABLE IF NOT EXISTS org_invitations (
  code       VARCHAR(32) PRIMARY KEY,
  org_id     UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  email      VARCHAR(255) NOT NULL,
  role       VARCHAR(12) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ
);
