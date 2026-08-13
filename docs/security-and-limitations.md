# Security and limitations

Secrets belong in ignored environment files or the deployment secret store. Card data, gateway passwords and webhook secrets are never valid documentation fixtures. Production images are immutable digests, containers are non-root, and operational endpoints are private.

This repository does not prove live gateway behavior, public TLS, SSH host identity, backup restoration, SMTP delivery, VPS capacity, or UAT. Those are explicit external gates. No production approval or measured capacity is claimed locally.
