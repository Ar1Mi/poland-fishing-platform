#!/bin/sh
# Starts busybox crond with one job. Cron jobs do not inherit the container environment, so the
# variables the backup needs are written to a file the job reads (mode 600, inside the container).
set -eu

: "${POSTGRES_USER:?}" "${POSTGRES_PASSWORD:?}" "${POSTGRES_DB:?}"
umask 077
{
  echo "export PGHOST='${PGHOST:-db}' PGUSER='${POSTGRES_USER}' PGDATABASE='${POSTGRES_DB}'"
  echo "export PGPASSWORD='${POSTGRES_PASSWORD}'"
  echo "export BACKUP_KEEP_DAYS='${BACKUP_KEEP_DAYS:-14}' BACKUP_DISK_WARN_PERCENT='${BACKUP_DISK_WARN_PERCENT:-80}'"
  echo "export TZ='${TZ:-Europe/Warsaw}'"
} > /run/backup.env

# Default: 2:30 Warsaw time, before the cleanup jobs of the API (3:30, 3:45).
echo "${BACKUP_CRON:-30 2 * * *} /usr/local/bin/backup.sh > /proc/1/fd/1 2>&1" > /etc/crontabs/root

# A failed first backup (database not up yet) must not stop the schedule.
if [ "${BACKUP_ON_START:-false}" = "true" ]; then
  /usr/local/bin/backup.sh || true
fi
echo "backup: scheduled '${BACKUP_CRON:-30 2 * * *}' (${TZ:-Europe/Warsaw}), keeping ${BACKUP_KEEP_DAYS:-14} days"
exec crond -f -l 6
