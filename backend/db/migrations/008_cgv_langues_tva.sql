-- Migration 008 : CGV en français et en anglais, TVA choisie par devis. 100 % additif.
ALTER TABLE cgv_versions ADD COLUMN IF NOT EXISTS langue VARCHAR(2) DEFAULT 'fr';
ALTER TABLE pros  ADD COLUMN IF NOT EXISTS cgv_en_version_id UUID;   -- version anglaise proposée (cgv_version_id = française)
ALTER TABLE devis ADD COLUMN IF NOT EXISTS cgv_langue VARCHAR(2) DEFAULT 'fr';
ALTER TABLE devis ADD COLUMN IF NOT EXISTS tva_mode   VARCHAR(15);   -- 'incluse' | 'non_applicable' (NULL = devis antérieurs)
