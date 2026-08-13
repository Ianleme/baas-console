# Approved delivery and rollback

`.github/workflows/deploy.yml` is a manual, production-Environment-approved workflow. Deploys are serialized and accept only full image digests. The target VPS must expose a root-owned, restricted `baas-deploy` command; the SSH account cannot run arbitrary commands or become root.

The command sequence is **preflight → migrate → health-and-smoke**. A failed health or smoke check invokes `rollback`, restoring the digest recorded by the host. Rollback never runs a down migration. Database backup/restore is a separately approved procedure and is intentionally not automated here.

Required private configuration: `PRODUCTION_HOST`, `PRODUCTION_USER`, `PRODUCTION_KNOWN_HOSTS`, `PRODUCTION_SSH_KEY`. No credentials, host keys, domain, or VPS are present in this repository. Real VPS/domain/SSH, TLS, backup/restore, and rollback validation are external blockers for T049.

The host-side allowlist must validate digests again, persist the previous compose image file atomically, run `docker compose -f docker-compose.prod.yml up -d migrate`, then health and smoke checks. Never use mutable tags or `docker compose down` as rollback.
