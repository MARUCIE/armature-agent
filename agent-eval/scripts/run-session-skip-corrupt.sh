#!/usr/bin/env bash
set -euo pipefail

MODE="${1:?mode required}"
REPO_ROOT="${PROJECT_DIR:-$(pwd)}"
cd "$REPO_ROOT"

bash agent-eval/scripts/prepare-fast-gate.sh >/dev/null

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

mkdir -p "$TMP_ROOT/home/.armature/sessions"
cat > "$TMP_ROOT/home/.armature/sessions/2026-04-16T00-00-00-alpha-good.json" <<EOF
{
  "provider": "openai",
  "model": "gpt-5.4",
  "history": [
    {"role": "user", "content": "hello from session"},
    {"role": "assistant", "content": "session reply"}
  ],
  "stats": {"turns": 2, "inputTokens": 10, "outputTokens": 11},
  "savedAt": "2026-04-16T00:00:00.000Z"
}
EOF
printf '{bad json\n' > "$TMP_ROOT/home/.armature/sessions/2026-04-16T00-01-00-alpha-bad.json"

case "$MODE" in
  list)
    OUTPUT="$(env -i PATH="$PATH" HOME="$TMP_ROOT/home" ARMATURE_HOME="$TMP_ROOT/home/.armature" node dist/bin/armature.js session list)"
    printf '%s\n' "$OUTPUT"
    ! grep -q 'alpha-bad' <<<"$OUTPUT"
    ;;
  show)
    env -i PATH="$PATH" HOME="$TMP_ROOT/home" ARMATURE_HOME="$TMP_ROOT/home/.armature" node dist/bin/armature.js session show alpha
    ;;
  *)
    echo "unknown mode: $MODE" >&2
    exit 2
    ;;
esac
