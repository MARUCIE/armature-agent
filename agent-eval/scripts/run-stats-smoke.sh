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

mkdir -p "$TMP_HOME/.armature/logs"

HOME="$TMP_HOME" ARMATURE_HOME="$TMP_HOME/.armature" node --input-type=module - <<'EOF'
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

cat > "$TMP_HOME/.armature/logs/errors.log" <<EOF
[ERROR] stats smoke error
EOF

OUTPUT="$(
  env -i PATH="$PATH" HOME="$TMP_HOME" ARMATURE_HOME="$TMP_HOME/.armature" ARMATURE_PROVIDER=openai OPENAI_API_KEY=test-openai-key \
    node dist/bin/armature.js stats
)"
printf '%s\n' "$OUTPUT"

grep -q 'OVERVIEW' <<<"$OUTPUT"
grep -q 'COST & TOKENS' <<<"$OUTPUT"
grep -q 'RUNTIME HEALTH' <<<"$OUTPUT"
grep -q 'Recent Errors' <<<"$OUTPUT"
grep -q 'stats smoke error' <<<"$OUTPUT"
grep -q '\$0.01' <<<"$OUTPUT"
grep -q '100' <<<"$OUTPUT"
grep -q '50' <<<"$OUTPUT"
grep -q 'openai' <<<"$OUTPUT"
grep -q 'gpt-5.4' <<<"$OUTPUT"
! grep -q '(no usage data)' <<<"$OUTPUT"
printf 'stats-smoke-ok\n'
