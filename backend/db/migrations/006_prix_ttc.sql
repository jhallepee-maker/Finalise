-- Migration 006 : le pro peut saisir ses prix en TTC (montant final) ou en HT.
-- montant_ttc devient une colonne ordinaire (calculée par le service) pour que le total payé
-- soit EXACTEMENT le montant final annoncé par le pro. Les valeurs existantes sont conservées.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='devis'::regclass AND attname='montant_ttc' AND attgenerated='s') THEN
    ALTER TABLE devis ALTER COLUMN montant_ttc DROP EXPRESSION;
  END IF;
END $$;

ALTER TABLE devis ADD COLUMN IF NOT EXISTS prix_mode VARCHAR(3) DEFAULT 'ht';           -- 'ttc' | 'ht' : ce que le pro a saisi
ALTER TABLE devis_lignes ADD COLUMN IF NOT EXISTS prix_unitaire_ttc NUMERIC(10,2);
ALTER TABLE devis_lignes ALTER COLUMN prix_unitaire_ht TYPE NUMERIC(12,4);
