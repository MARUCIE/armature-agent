#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${PROJECT_DIR:-$(pwd)}"
cd "$REPO_ROOT"

bash agent-eval/scripts/prepare-fast-gate.sh >/dev/null

TMP_ROOT="$(mktemp -d)"
cleanup() {
  if [[ -n "${SERVE_PID:-}" ]]; then
    kill "$SERVE_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

mkdir -p "$TMP_ROOT/home" "${ARMATURE_EVAL_RUN_DIR:?ARMATURE_EVAL_RUN_DIR is required}/artifacts"
mkdir -p "$TMP_ROOT/bin"

cat > "$TMP_ROOT/bin/scutil" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$TMP_ROOT/bin/scutil"

PROVIDER_PORT="$(node -e 'const net=require("node:net"); const s=net.createServer(); s.listen(0,"127.0.0.1",()=>{console.log(s.address().port); s.close();});')"
SERVE_PORT="$(node -e 'const net=require("node:net"); const s=net.createServer(); s.listen(0,"127.0.0.1",()=>{console.log(s.address().port); s.close();});')"
REQUEST_PATH="$ARMATURE_EVAL_RUN_DIR/artifacts/fast-serve-chat-stream-request.json"
RESPONSE_HEADERS="$TMP_ROOT/serve-headers.txt"
RESPONSE_BODY="$TMP_ROOT/serve-body.txt"

cat > "$TMP_ROOT/.armature.json" <<EOF
{
  "providers": {
    "local": {
      "apiKey": "test-local-key",
      "baseURL": "http://127.0.0.1:$PROVIDER_PORT/v1",
      "defaultModel": "qwen3:32b"
    }
  },
  "defaultProvider": "local"
}
EOF

cat > "$TMP_ROOT/provider-stub.js" <<'EOF'
const http = require('node:http')
const fs = require('node:fs')

const port = Number(process.argv[2])
const requestPath = process.argv[3]

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      fs.writeFileSync(requestPath, body, 'utf-8')
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      })
      res.write('data: {"id":"chatcmpl-local","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"stub hello"},"finish_reason":null}]}\n\n')
      res.write('data: {"id":"chatcmpl-local","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":3}}\n\n')
      res.write('data: [DONE]\n\n')
      res.end()
    })
    return
  }

  if (req.method === 'GET' && req.url === '/v1/models') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ data: [{ id: 'qwen3:32b', object: 'model' }] }))
    return
  }

  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: 'not found' }))
})

server.listen(port, '127.0.0.1')
setTimeout(() => server.close(), 20000)
EOF

node "$TMP_ROOT/provider-stub.js" "$PROVIDER_PORT" "$REQUEST_PATH" > "$TMP_ROOT/provider-stub.out" 2>&1 &
PROVIDER_PID=$!

bash agent-eval/scripts/wait-for-http.sh "http://127.0.0.1:$PROVIDER_PORT/v1/models" "^(200)$" 50 0.1 >/dev/null

(
  cd "$TMP_ROOT"
  env -i PATH="$TMP_ROOT/bin:$PATH" HOME="$TMP_ROOT/home" ARMATURE_HOME="$TMP_ROOT/home/.armature" \
    node "$REPO_ROOT/dist/bin/armature.js" serve --provider local --port "$SERVE_PORT" > "$TMP_ROOT/armature-serve.out" 2>&1
) &
SERVE_PID=$!

bash agent-eval/scripts/wait-for-http.sh "http://127.0.0.1:$SERVE_PORT/health" "^(200)$" 50 0.1 >/dev/null

curl -sS -D "$RESPONSE_HEADERS" \
  -H 'Content-Type: application/json' \
  --data '{"prompt":"hello from SSE"}' \
  "http://127.0.0.1:$SERVE_PORT/chat" > "$RESPONSE_BODY"

cat "$RESPONSE_HEADERS"
echo '--- body ---'
cat "$RESPONSE_BODY"

grep -q 'stub hello' "$RESPONSE_BODY"
grep -q '"type":"usage"' "$RESPONSE_BODY"
grep -q '"type":"done"' "$RESPONSE_BODY"
grep -q 'data: \[DONE\]' "$RESPONSE_BODY"
! grep -q '"type":"error"' "$RESPONSE_BODY"
grep -qi '^Content-Type: text/event-stream' "$RESPONSE_HEADERS"
grep -q '"stream":true' "$REQUEST_PATH"
grep -q 'hello from SSE' "$REQUEST_PATH"
printf 'sse-stream-ok\n'
