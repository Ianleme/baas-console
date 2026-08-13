#!/usr/bin/env bash
set -euo pipefail
host=${1:?host}; user=${2:?user}; key=${3:?key}; api=${4:?api digest}; web=${5:?web digest}
[[ "$api" =~ @sha256:[a-f0-9]{64}$ && "$web" =~ @sha256:[a-f0-9]{64}$ ]] || { echo 'digest-only images required'; exit 2; }
[[ -n "${SSH_AUTH_SOCK:-}${key}" ]] || { echo 'SSH credential required'; exit 2; }
remote=(ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes -i "$key" "${user}@${host}")
"${remote[@]}" baas-deploy preflight "$api" "$web"
"${remote[@]}" baas-deploy migrate
if ! "${remote[@]}" baas-deploy health-and-smoke; then
  echo 'Health/smoke failed; restoring the recorded previous digest (no down migration)' >&2
  "${remote[@]}" baas-deploy rollback
  exit 1
fi
