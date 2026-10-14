-- Migration 002 : intégrité de la signature électronique
-- contenu_snapshot : copie figée de ce que le client a vu et signé
-- contenu_hash     : SHA-256 de ce snapshot (preuve que le contenu n'a pas changé)
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS contenu_snapshot JSONB;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS contenu_hash VARCHAR(64);
