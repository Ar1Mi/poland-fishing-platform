#!/bin/sh
# Starts busybox crond with one job. Cron jobs do not inherit the container environment, so what
# the backup needs is written to files the job reads: the password to a pgpass file (no shell
# quoting of a secret), the rest — numbers and names checked here — to an env file. Mode 600.
set -eu

: "${POSTGRES_USER:?}" "${POSTGRES_PASSWORD:?}" "${POSTGRES_DB:?}"
keep=${BACKUP_KEEP_DAYS:-14}
warn=${BACKUP_DISK_WARN_PERCENT:-80}
case "$keep$warn" in *[!0-9]*) echo "BACKUP_KEEP_DAYS and BACKUP_DISK_WARN_PERCENT must be numbers" >&2; exit 1 ;; esac
case "$POSTGRES_USER$POSTGRES_DB" in *[!A-Za-z0-9_]*) echo "POSTGRES_USER and POSTGRES_DB: letters, digits, _" >&2; exit 1 ;; esac

umask 077
# pgpass escapes `\` and `:` in its fields.
printf 'db:5432:%s:%s:%s\n' "$POSTGRES_DB" "$POSTGRES_USER" \
  "$(printf '%s' "$POSTGRES_PASSWORD" | sed -e 's/\\/\\\\/g' -e 's/:/\\:/g')" > /run/pgpass
cat > /run/backup.env <<ENV
export PGHOST=db PGUSER=$POSTGRES_USER PGDATABASE=$POSTGRES_DB PGPASSFILE=/run/pgpass
export BACKUP_KEEP_DAYS=$keep BACKUP_DISK_WARN_PERCENT=$warn
ENV

# 1:30 Warsaw time: 2:00–3:00 does not exist on the night the clocks go forward, and crond
# would skip a job set inside it. Before the cleanup jobs of the API (3:30, 3:45).
schedule=${BACKUP_CRON:-30 1 * * *}
echo "$schedule /usr/local/bin/backup.sh > /proc/1/fd/1 2>&1" > /etc/crontabs/root

# A failed first backup (database not up yet) must not stop the schedule.
if [ "${BACKUP_ON_START:-false}" = "true" ]; then
  /usr/local/bin/backup.sh || true
fi
echo "backup: scheduled '$schedule' (${TZ:-UTC}), keeping $keep days"
exec crond -f -l 6
