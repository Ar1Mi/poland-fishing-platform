#!/bin/sh
# One backup: /backups/db-<time>.dump (pg_dump custom format, `pg_restore` reads it) and
# /backups/uploads-<time>.tar.gz. Written under a temporary name first: a file with the final
# name is complete. Run by hand: `docker compose -f docker-compose.prod.yml exec backup backup.sh`.
set -eu
[ -f /run/backup.env ] && . /run/backup.env

dir=/backups
stamp=$(date +%Y%m%d-%H%M%S)
log() { echo "backup: $(date -Iseconds) $*"; }
# A failed run leaves no half-written file behind.
trap 'status=$?; rm -f "$dir/.db-$stamp.dump.part" "$dir/.uploads-$stamp.tar.gz.part"; [ "$status" -eq 0 ] || log "FAILED (exit $status)"' EXIT

pg_dump --format=custom --file="$dir/.db-$stamp.dump.part"
mv "$dir/.db-$stamp.dump.part" "$dir/db-$stamp.dump"
log "database → db-$stamp.dump ($(du -h "$dir/db-$stamp.dump" | cut -f1))"

tar -czf "$dir/.uploads-$stamp.tar.gz.part" -C /uploads .
mv "$dir/.uploads-$stamp.tar.gz.part" "$dir/uploads-$stamp.tar.gz"
log "uploads → uploads-$stamp.tar.gz ($(du -h "$dir/uploads-$stamp.tar.gz" | cut -f1))"

# Older than BACKUP_KEEP_DAYS days; leftovers of an interrupted run too.
find "$dir" -maxdepth 1 \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' -o -name '.*.part' \) \
  -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete

# The disk the backups share with the volumes (uploads may grow, docs/07-security.md).
used=$(df -P "$dir" | awk 'NR == 2 { sub("%", "", $5); print $5 }')
if [ "$used" -ge "${BACKUP_DISK_WARN_PERCENT:-80}" ]; then
  log "WARNING disk ${used}% full"
fi
