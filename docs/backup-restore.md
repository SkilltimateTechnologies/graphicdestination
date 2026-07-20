# Runbook: Backup & Restore

**Scope:** the application database (users, projects, assets, user_settings) —
the only stateful component. Everything else (containers, client build) is
reproducible from source.

**Owner:** platform on-call. **Review cadence:** re-run the restore drill
(§4) quarterly and after any schema change.

---

## Targets

| Metric | Target | Rationale |
|---|---|---|
| **RPO** (max data loss) | ≤ 24h (daily), ≤ 1h once PITR is on | Projects are user work product. |
| **RTO** (max time to restore) | ≤ 1h | A tested, scripted restore path. |
| Backup retention | 30 daily + 12 monthly | Covers slow-to-notice corruption. |
| Restore drill | Quarterly, into a scratch DB | An untested backup is not a backup. |

> The database is the business. Assets currently live **inside** the DB as
> base64 (see ROADMAP 2.1); until they move to object storage, the DB backup is
> also the asset backup — size your backups accordingly.

---

## 1. Production on Turso (managed)

Turso is the production backend (`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` set).

### 1a. Platform-native backups (preferred)
- Turso provides point-in-time recovery on paid plans. **Enable PITR** and set
  the retention window to meet the RPO above. Verify it is on:
  ```bash
  turso db show <db-name>            # confirm the plan + PITR status
  ```
- PITR restore (creates a new DB at a timestamp — never overwrite the live one
  blind):
  ```bash
  turso db create <db-name>-restore --from-db <db-name> --timestamp 2026-07-20T09:00:00Z
  ```

### 1b. Independent logical dumps (defense in depth)
Run daily from CI/cron; store off-Turso (e.g. S3/R2) so a Turso-side incident
can't take the backups with it:
```bash
# dump the live DB to a portable SQLite file
turso db shell <db-name> ".dump" > backup-$(date +%F).sql
# (or, if a local libsql/sqlite copy is available)
sqlite3 restored.db < backup-YYYY-MM-DD.sql
gzip backup-$(date +%F).sql
# upload the .gz to object storage with the retention policy applied
```
Encrypt at rest and restrict read access — dumps contain password hashes and all
user assets.

---

## 2. Local / self-hosted SQLite

With `TURSO_*` unset the DB is a single file: `server/data/app.db`.

```bash
# online, consistent backup (safe while the server runs)
sqlite3 server/data/app.db ".backup 'backup-$(date +%F).db'"
gzip backup-$(date +%F).db
```
Back up the whole `server/data/` directory (WAL/SHM siblings included) if you
copy files directly instead of using `.backup`. **Ephemeral hosts (Railway
default filesystem) lose this file on redeploy — do not run production on the
local-SQLite path without a mounted volume.** This is also flagged at boot: with
`NODE_ENV=production` and no `TURSO_*`, `config.js` logs a warning.

---

## 3. Restore procedure (production)

1. **Declare an incident** and stop writes: scale the app to 0, or put it in
   maintenance so no new writes race the restore.
2. **Restore to a NEW database**, never over the live one:
   - Turso PITR: §1a creates `<db-name>-restore`.
   - From a logical dump: create a fresh Turso DB and load the `.sql`, or stand
     up a local `restored.db` from the dump.
3. **Verify** the restored copy (§4) before cutting over.
4. **Cut over:** point `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` (or the mounted
   file) at the verified restore, redeploy, and confirm `GET /api/ready` → 200.
5. **Post-incident:** record what was lost (the RPO gap), root cause, and any
   follow-up in an incident note.

---

## 4. Restore drill / verification (run quarterly)

Restore the latest backup into a scratch DB and assert it is usable:

```bash
# 1. materialize the backup into a throwaway SQLite file
gunzip -c backup-latest.sql.gz | sqlite3 drill.db     # or restore via Turso to a scratch DB

# 2. structural sanity
sqlite3 drill.db "PRAGMA integrity_check;"            # expect: ok
sqlite3 drill.db ".tables"                            # expect: users projects assets user_settings

# 3. data sanity (counts should look plausible, not zero)
sqlite3 drill.db "SELECT COUNT(*) FROM users;"
sqlite3 drill.db "SELECT COUNT(*) FROM projects;"

# 4. functional: boot the app against the restore and hit readiness
TURSO_DATABASE_URL= TURSO_AUTH_TOKEN= \
  cp drill.db server/data/app.db && (cd server && node index.js &) && sleep 2 && \
  curl -fsS localhost:8787/api/ready    # expect {"ready":true,...}
```

Record the drill date and outcome. A drill that can't produce a bootable,
readiness-passing DB is a **failed backup** — fix the pipeline, don't file it.

---

## 5. What is NOT backed up (and is fine)

- Client build artifacts (`client/dist`) — rebuilt from source.
- In-memory rate-limiter state — intentionally ephemeral (ROADMAP 2.3).
- `server/data/admin-credentials.json` — a one-time bootstrap file that is meant
  to be deleted; never restore it.
- Secrets (`JWT_SECRET`, tokens) — live in the platform's secret store, not the
  DB. Keep them in your secrets manager with their own rotation policy.
