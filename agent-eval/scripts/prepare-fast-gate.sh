#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${PROJECT_DIR:-$(pwd)}"
cd "$REPO_ROOT"

DIST_ENTRY="$REPO_ROOT/dist/bin/orca.js"
needs_build=0

if [[ ! -f "$DIST_ENTRY" ]]; then
  needs_build=1
elif [[ "$REPO_ROOT/package.json" -nt "$DIST_ENTRY" ]] || [[ "$REPO_ROOT/tsconfig.json" -nt "$DIST_ENTRY" ]]; then
  needs_build=1
elif find "$REPO_ROOT/src" -type f \( -name '*.ts' -o -name '*.tsx' \) -newer "$DIST_ENTRY" -print -quit | grep -q .; then
  needs_build=1
fi

if [[ "$needs_build" -eq 1 ]]; then
  npm run build >/dev/null
fi

printf '%s\n' "$REPO_ROOT"
