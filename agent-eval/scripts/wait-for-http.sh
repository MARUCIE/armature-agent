#!/usr/bin/env bash
set -euo pipefail

URL="${1:?url required}"
ACCEPT_PATTERN="${2:-^(200)$}"
ATTEMPTS="${3:-50}"
SLEEP_SECONDS="${4:-0.1}"
LAST_STATUS="000"

for ((i=1; i<=ATTEMPTS; i++)); do
  LAST_STATUS="$(curl -s -o /dev/null -w '%{http_code}' "$URL" || true)"
  if printf '%s' "$LAST_STATUS" | grep -Eq "$ACCEPT_PATTERN"; then
    exit 0
  fi
  sleep "$SLEEP_SECONDS"
done

printf 'timeout waiting for %s (last status=%s)\n' "$URL" "$LAST_STATUS" >&2
exit 1
