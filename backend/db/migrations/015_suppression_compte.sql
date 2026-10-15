-- Migration 015 : suppression de compte (anonymisation). 100 % additif.
ALTER TABLE pros ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
