#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${PROJECT_DIR:-$(pwd)}"
cd "$REPO_ROOT"

bash agent-eval/scripts/prepare-fast-gate.sh >/dev/null

TMP_HOME="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_HOME"
}
trap cleanup EXIT

mkdir -p "$TMP_HOME/.orca"

HOME="$TMP_HOME" ORCA_HOME="$TMP_HOME/.orca" node --input-type=module - <<'EOF'
import { recordUsage } from './dist/usage-db.js'

recordUsage({
  provider: 'openai',
  model: 'gpt-5.4',
  inputTokens: 100,
  outputTokens: 50,
  costUsd: 0.01,
  durationMs: 1000,
  command: 'chat',
  cwd: process.cwd(),
})
EOF

OUTPUT="$(
  env -i PATH="$PATH" HOME="$TMP_HOME" ORCA_HOME="$TMP_HOME/.orca" \
    node dist/bin/orca.js stats daily
)"
printf '%s\n' "$OUTPUT"

grep -q 'Daily Usage' <<<"$OUTPUT"
grep -q '2026-' <<<"$OUTPUT"
grep -q '\$0.010' <<<"$OUTPUT"
grep -q '150' <<<"$OUTPUT"
! grep -q '(no usage data)' <<<"$OUTPUT"
printf 'stats-daily-ok\n'
