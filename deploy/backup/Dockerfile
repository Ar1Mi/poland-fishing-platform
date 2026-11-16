# Nightly backup of the production stack (T-30): `pg_dump` of the database and a tar of the
# uploaded files into /backups, kept BACKUP_KEEP_DAYS days. Same major version as the db service.
FROM postgres:16-alpine
COPY backup.sh entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
