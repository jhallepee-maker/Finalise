-- Migration 004 : structure V1
-- Profil légal du pro, devis à lignes numérotés, champs client à compléter, factures.
-- 100 % additif : aucune colonne ni donnée existante n'est modifiée.

-- ── Profil légal du pro (nécessaire sur devis et factures) ──
ALTER TABLE pros ADD COLUMN IF NOT EXISTS telephone    VARCHAR(30);
ALTER TABLE pros ADD COLUMN IF NOT EXISTS adresse      VARCHAR(255);
ALTER TABLE pros ADD COLUMN IF NOT EXISTS code_postal  VARCHAR(10);
ALTER TABLE pros ADD COLUMN IF NOT EXISTS ville        VARCHAR(120);
ALTER TABLE pros ADD COLUMN IF NOT EXISTS tva_franchise BOOLEAN DEFAULT FALSE; -- « TVA non applicable, art. 293 B du CGI »
ALTER TABLE pros ADD COLUMN IF NOT EXISTS cgv_url      TEXT;                    -- CGV du pro : case à cocher côté client si renseignée

-- ── Devis : numéro, objet, infos client, champs que le client doit compléter ──
ALTER TABLE devis ADD COLUMN IF NOT EXISTS numero          VARCHAR(30);
ALTER TABLE devis ADD COLUMN IF NOT EXISTS objet           VARCHAR(255);
ALTER TABLE devis ADD COLUMN IF NOT EXISTS date_prestation VARCHAR(120);
ALTER TABLE devis ADD COLUMN IF NOT EXISTS client_adresse  TEXT;
-- Champs que le client DOIT avoir renseignés avant de payer (parmi nom, email, tel, adresse)
ALTER TABLE devis ADD COLUMN IF NOT EXISTS champs_requis   JSONB DEFAULT '["nom","email","tel"]'::jsonb;

-- ── Lignes de devis ──
CREATE TABLE IF NOT EXISTS devis_lignes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id         UUID NOT NULL REFERENCES devis(id) ON DELETE CASCADE,
  position         INT  NOT NULL DEFAULT 0,
  description      TEXT NOT NULL,
  quantite         NUMERIC(10,2) NOT NULL DEFAULT 1,
  prix_unitaire_ht NUMERIC(10,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_devis_lignes_devis ON devis_lignes(devis_id);

-- ── Numérotation séquentielle par pro / type / année (DEV-2026-0001, FAC-2026-0001) ──
CREATE TABLE IF NOT EXISTS numerotation (
  pro_id  UUID NOT NULL REFERENCES pros(id),
  type    VARCHAR(10) NOT NULL,
  annee   INT  NOT NULL,
  dernier INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (pro_id, type, annee)
);

-- ── Factures (document figé émis au paiement) ──
CREATE TABLE IF NOT EXISTS factures (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id    UUID NOT NULL UNIQUE REFERENCES devis(id),
  pro_id      UUID NOT NULL REFERENCES pros(id),
  numero      VARCHAR(30) NOT NULL,
  montant_ht  NUMERIC(10,2) NOT NULL,
  tva_pct     NUMERIC(5,2)  NOT NULL,
  montant_ttc NUMERIC(10,2) NOT NULL,
  snapshot    JSONB NOT NULL,   -- pro, client, lignes, mentions : copie immuable à la date d'émission
  emise_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (pro_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_factures_pro ON factures(pro_id);

-- Un numéro de devis est unique par pro
CREATE UNIQUE INDEX IF NOT EXISTS idx_devis_numero ON devis(pro_id, numero) WHERE numero IS NOT NULL;
