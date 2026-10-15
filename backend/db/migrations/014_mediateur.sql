-- Médiateur de la consommation du professionnel (art. L612-1 et R616-1 Code de la consommation)
ALTER TABLE pros ADD COLUMN IF NOT EXISTS mediateur TEXT;
