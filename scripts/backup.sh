#!/usr/bin/env bash
# Sauvegarde chiffrée de la base Finalise. Usage :
#   DATABASE_URL='postgres://…' BACKUP_PASSPHRASE='phrase-longue' ./scripts/backup.sh [dossier]
# Produit finalise-AAAAMMJJ-HHMM.sql.gz.enc (AES-256). Garde les 30 dernières.
# Restauration : openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in X.enc | gunzip | psql "$DATABASE_URL"
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL manquante}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE manquante (ne la perds pas : sans elle le backup est illisible)}"
DIR="${1:-./backups}"; mkdir -p "$DIR"
OUT="$DIR/finalise-$(date +%Y%m%d-%H%M).sql.gz.enc"
pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip -9 \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -out "$OUT"
[ -s "$OUT" ] || { echo "Sauvegarde vide" >&2; rm -f "$OUT"; exit 1; }
ls -1t "$DIR"/finalise-*.enc | tail -n +31 | xargs -r rm -f
echo "OK $OUT ($(du -h "$OUT" | cut -f1))"
