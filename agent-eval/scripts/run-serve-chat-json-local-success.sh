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

mkdir -p "$TMP_ROOT/home" "$TMP_ROOT/bin" "${ORCA_EVAL_RUN_DIR:?ORCA_EVAL_RUN_DIR is required}/artifacts"

cat > "$TMP_ROOT/bin/scutil" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$TMP_ROOT/bin/scutil"

PROVIDER_PORT="$(node -e 'const net=require("node:net"); const s=net.createServer(); s.listen(0,"127.0.0.1",()=>{console.log(s.address().port); s.close();});')"
SERVE_PORT="$(node -e 'const net=require("node:net"); const s=net.createServer(); s.listen(0,"127.0.0.1",()=>{console.log(s.address().port); s.close();});')"
REQUEST_PATH="$ORCA_EVAL_RUN_DIR/artifacts/fast-serve-chat-json-request.json"
RESPONSE_BODY="$TMP_ROOT/serve-json-body.txt"
RESPONSE_STATUS="$TMP_ROOT/serve-json-status.txt"

cat > "$TMP_ROOT/.orca.json" <<EOF
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
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        id: 'chatcmpl-local',
        object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: 'stub json hello' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 12, completion_tokens: 3 },
      }))
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
  env -i PATH="$TMP_ROOT/bin:$PATH" HOME="$TMP_ROOT/home" ORCA_HOME="$TMP_ROOT/home/.orca" \
    node "$REPO_ROOT/dist/bin/orca.js" serve --provider local --port "$SERVE_PORT" > "$TMP_ROOT/orca-serve.out" 2>&1
) &
SERVE_PID=$!

bash agent-eval/scripts/wait-for-http.sh "http://127.0.0.1:$SERVE_PORT/health" "^(200)$" 50 0.1 >/dev/null

STATUS="$(
  curl -sS -o "$RESPONSE_BODY" -w "%{http_code}" \
    -H 'Content-Type: application/json' \
    --data '{"prompt":"hello from JSON","stream":false}' \
    "http://127.0.0.1:$SERVE_PORT/chat"
)"
printf '%s\n' "$STATUS" > "$RESPONSE_STATUS"

cat "$RESPONSE_STATUS"
echo '--- body ---'
cat "$RESPONSE_BODY"

grep -q '"text":"stub json hello"' "$RESPONSE_BODY"
grep -q '"model":"qwen3:32b"' "$RESPONSE_BODY"
grep -q '"inputTokens":12' "$RESPONSE_BODY"
grep -q '"outputTokens":3' "$RESPONSE_BODY"
! grep -q '"error"' "$RESPONSE_BODY"
grep -q '"hello from JSON"' "$REQUEST_PATH"
printf 'json-chat-ok\n'
