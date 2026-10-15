-- Migration 013 : date_prestation (résumé lisible des dates) dépassait 120 caractères dès 3 à 4 dates → erreur 500 à la création.
ALTER TABLE devis ALTER COLUMN date_prestation TYPE TEXT;
