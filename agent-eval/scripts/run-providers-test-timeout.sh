#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${PROJECT_DIR:-$(pwd)}"
cd "$REPO_ROOT"

bash agent-eval/scripts/prepare-fast-gate.sh >/dev/null

TMP_ROOT="$(mktemp -d)"
cleanup() {
  if [[ -n "${STUB_PID:-}" ]]; then
    kill "$STUB_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

PORT="$(node -e 'const net=require("node:net"); const s=net.createServer(); s.listen(0,"127.0.0.1",()=>{console.log(s.address().port); s.close();});')"
mkdir -p "$TMP_ROOT/home"

cat > "$TMP_ROOT/.armature.json" <<EOF
{
  "providers": {
    "local": {
      "apiKey": "test-local-key",
      "baseURL": "http://127.0.0.1:$PORT/v1",
      "defaultModel": "qwen3:32b"
    }
  },
  "defaultProvider": "local"
}
EOF

cat > "$TMP_ROOT/hang.js" <<'EOF'
const http = require('node:http')
const port = Number(process.argv[2])

const server = http.createServer((req, res) => {
  if (req.url === '/v1/models') {
    return
  }
  res.writeHead(404)
  res.end()
})

server.listen(port, '127.0.0.1')
setTimeout(() => server.close(), 20000)
EOF

node "$TMP_ROOT/hang.js" "$PORT" > "$TMP_ROOT/stub.out" 2>&1 &
STUB_PID=$!

OUTPUT="$(
  cd "$TMP_ROOT" &&
  env -i PATH="$PATH" HOME="$TMP_ROOT/home" ARMATURE_HOME="$TMP_ROOT/home/.armature" \
    node "$REPO_ROOT/dist/bin/armature.js" providers test local
)"
printf '%s\n' "$OUTPUT"

grep -q 'FAIL' <<<"$OUTPUT"
grep -q 'timeout' <<<"$OUTPUT"
printf 'providers-timeout-ok\n'
