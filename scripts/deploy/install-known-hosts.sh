#!/usr/bin/env bash
set -euo pipefail
hosts=${1:-}
[[ -n "$hosts" && "$hosts" != *$'\n'*$'\n'* ]] || { echo 'A pinned known_hosts value is required'; exit 2; }
umask 077
mkdir -p "${HOME}/.ssh"
printf '%s\n' "$hosts" > "${HOME}/.ssh/known_hosts"
chmod 600 "${HOME}/.ssh/known_hosts"
