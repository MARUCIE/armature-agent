#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${PROJECT_DIR:-$(pwd)}"
cd "$REPO_ROOT"

bash agent-eval/scripts/prepare-fast-gate.sh >/dev/null

TMP_ROOT="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

mkdir -p "$TMP_ROOT/home"

PORT="$(node -e 'const net=require("node:net"); const s=net.createServer(); s.listen(0,"127.0.0.1",()=>{console.log(s.address().port); s.close();});')"

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

cat > "$TMP_ROOT/stub.js" <<'EOF'
const http = require('node:http')

const port = Number(process.argv[2])

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ data: [{ id: 'qwen3:32b', object: 'model' }] }))
    return
  }

  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    req.on('data', () => {})
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        id: 'chatcmpl-local',
        object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: 'stub hello' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 12, completion_tokens: 3 },
      }))
    })
    return
  }

  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: 'not found' }))
})

server.listen(port, '127.0.0.1')
setTimeout(() => server.close(), 20000)
EOF

node "$TMP_ROOT/stub.js" "$PORT" > "$TMP_ROOT/stub.out" 2>&1 &
STUB_PID=$!

bash agent-eval/scripts/wait-for-http.sh "http://127.0.0.1:$PORT/v1/models" "^(200)$" 50 0.1 >/dev/null

OUTPUT="$(
  cd "$TMP_ROOT" &&
  env -i PATH="$PATH" HOME="$TMP_ROOT/home" ARMATURE_HOME="$TMP_ROOT/home/.armature" \
    node "$REPO_ROOT/dist/bin/armature.js" run "say hello" --provider local --done-when "exit 0: true" --max-turns 1
)"
printf '%s\n' "$OUTPUT"

! grep -q 'Error:' <<<"$OUTPUT"
! grep -q 'fetch failed' <<<"$OUTPUT"
! grep -q 'no provider baseURL configured' <<<"$OUTPUT"
printf 'provider-path-ok\n'
