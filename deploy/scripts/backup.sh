#!/usr/bin/env bash
# Sauvegarde MySQL quotidienne (dump cohérent --single-transaction), rotation 14 jours.
# À planifier sur le serveur :  crontab -e
#   30 2 * * * /opt/crm-lead/deploy/scripts/backup.sh >> /var/log/crm-backup.log 2>&1
#
# Restauration :
#   gunzip -c deploy/backups/crm-AAAAMMJJ-HHMM.sql.gz | \
#     docker compose -f deploy/docker-compose.yml exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" crm'
#
# ⚠️ Sauvegarder aussi PII_ENCRYPTION_KEY (hors serveur) : sans elle, emails/téléphones chiffrés sont illisibles.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
FILE="backups/crm-$(date +%Y%m%d-%H%M).sql.gz"
docker compose -f docker-compose.yml --env-file .env exec -T mysql sh -c \
  'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers crm' | gzip > "${FILE}"
find backups -name 'crm-*.sql.gz' -mtime +14 -delete
echo "✔ $(date -Is) sauvegarde ${FILE} ($(du -h "${FILE}" | cut -f1))"
