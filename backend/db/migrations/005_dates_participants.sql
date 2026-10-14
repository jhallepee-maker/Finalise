-- Migration 005 : dates proposées (journée entière ou créneau), participants. 100 % additif.
-- dates : [{ "date":"2027-03-14", "mode":"journee" }, { "date":"2027-03-15", "mode":"creneau", "debut":"08:00", "fin":"14:00" }]
-- Plusieurs dates = le client en choisit une à la signature.
ALTER TABLE devis ADD COLUMN IF NOT EXISTS dates            JSONB;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS date_choisie     JSONB;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS participants_max INT;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS participants_nb  INT;
