# Private handoff checklist

Provide privately, never in Git: sandbox credentials and approved test identities; production domain/TLS details; VPS host, pinned SSH host key, restricted deploy account/key; registry access; SMTP settings; backup/restore owner and window; evaluator UAT contacts.

After provisioning, run the documented deploy preflight and retain sanitized command output. Live evidence must be hashed and stored in CI retention, not committed with secrets.
