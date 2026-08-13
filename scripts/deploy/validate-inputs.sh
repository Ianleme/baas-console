#!/usr/bin/env bash
set -euo pipefail
image_re='^[a-z0-9./:_-]+@sha256:[a-f0-9]{64}$'
[[ "${1:-}" =~ $image_re ]] || { echo 'API image must be digest-only'; exit 2; }
[[ "${2:-}" =~ $image_re ]] || { echo 'WEB image must be digest-only'; exit 2; }
[[ "$1" != *:latest@* && "$2" != *:latest@* ]] || exit 2
