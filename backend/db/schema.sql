-- Finalise — schéma base de données

-- Professionnels (indépendants)
CREATE TABLE IF NOT EXISTS pros (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  nom           VARCHAR(255) NOT NULL,
  prenom        VARCHAR(255),
  siret         VARCHAR(14),
  activite      VARCHAR(255),
  stripe_account_id VARCHAR(255),  -- Stripe Connect Express account
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Devis / factures
CREATE TABLE IF NOT EXISTS devis (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id        UUID NOT NULL REFERENCES pros(id),
  token_unique  VARCHAR(64) UNIQUE NOT NULL,  -- lien unique client
  client_nom    VARCHAR(255),
  client_email  VARCHAR(255),
  client_tel    VARCHAR(30),
  description   TEXT NOT NULL,
  montant_ht    NUMERIC(10,2) NOT NULL,
  tva_pct       NUMERIC(5,2) DEFAULT 20,
  montant_ttc   NUMERIC(10,2) GENERATED ALWAYS AS (montant_ht * (1 + tva_pct/100)) STORED,
  statut        VARCHAR(30) DEFAULT 'en_attente',  -- en_attente | signe | paye | expire
  expire_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Paiements / transactions
CREATE TABLE IF NOT EXISTS paiements (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id             UUID NOT NULL REFERENCES devis(id),
  stripe_payment_intent VARCHAR(255) UNIQUE,
  montant_ttc          NUMERIC(10,2),
  commission_joseph    NUMERIC(10,2),  -- 1%
  stripe_fees          NUMERIC(10,2),
  montant_net_pro      NUMERIC(10,2),
  statut               VARCHAR(30) DEFAULT 'pending',
  paye_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Signatures électroniques (eIDAS / Code Civil art. 1366-1367)
CREATE TABLE IF NOT EXISTS signatures (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id   UUID NOT NULL REFERENCES devis(id),
  nom_signe  VARCHAR(255) NOT NULL,
  checkbox   BOOLEAN NOT NULL DEFAULT TRUE,
  ip_address VARCHAR(45),
  user_agent TEXT,
  signe_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_devis_token ON devis(token_unique);
CREATE INDEX IF NOT EXISTS idx_devis_pro   ON devis(pro_id);
CREATE INDEX IF NOT EXISTS idx_paiements_devis ON paiements(devis_id);
