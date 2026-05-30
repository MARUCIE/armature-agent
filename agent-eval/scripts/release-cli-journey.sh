#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${PROJECT_DIR:-$(pwd)}"
RUN_DIR="${ARMATURE_EVAL_RUN_DIR:?ARMATURE_EVAL_RUN_DIR is required}"
OUT_DIR="$RUN_DIR/manual"
OUT_FILE="$OUT_DIR/release-cli-journey.md"

mkdir -p "$OUT_DIR"
cd "$REPO_ROOT"

bash agent-eval/scripts/prepare-fast-gate.sh >/dev/null

TMP_HOME="$(mktemp -d)"
cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_HOME"
}
trap cleanup EXIT

mkdir -p "$TMP_HOME/.armature/sessions"
cat > "$TMP_HOME/.armature/sessions/2026-04-16T00-00-00-demo.json" <<'EOF'
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

PR_FIXTURE="$TMP_HOME/pr-fixture"
mkdir -p "$PR_FIXTURE/bin" "$PR_FIXTURE/home"
cat > "$PR_FIXTURE/bin/gh" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "--version" ]]; then
  echo 'gh version 9.9.9'
  exit 0
fi
if [[ "$1" == "pr" ]]; then
  echo 'authentication failed' >&2
  exit 1
fi
exit 1
EOF
chmod +x "$PR_FIXTURE/bin/gh"

PR_CHECKOUT_FIXTURE="$TMP_HOME/pr-checkout-fixture"
mkdir -p "$PR_CHECKOUT_FIXTURE/bin" "$PR_CHECKOUT_FIXTURE/home"
cat > "$PR_CHECKOUT_FIXTURE/bin/gh" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "--version" ]]; then
  echo 'gh version 9.9.9'
  exit 0
fi
if [[ "$1" == "pr" && "$2" == "view" ]]; then
  if [[ "${7:-}" == ".title" ]]; then
    echo 'Demo PR'
    exit 0
  fi
  if [[ "${7:-}" == ".body" ]]; then
    echo 'Demo body'
    exit 0
  fi
fi
if [[ "$1" == "pr" && "$2" == "diff" ]]; then
  echo 'diff --git a/a b/a'
  exit 0
fi
if [[ "$1" == "pr" && "$2" == "checkout" ]]; then
  echo 'checkout failed' >&2
  exit 1
fi
exit 1
EOF
chmod +x "$PR_CHECKOUT_FIXTURE/bin/gh"

PROVIDER_FIXTURE="$TMP_HOME/provider-fixture"
PORT_REFUSED="$(node -e 'const net=require("node:net"); const s=net.createServer(); s.listen(0,"127.0.0.1",()=>{console.log(s.address().port); s.close();});')"
mkdir -p "$PROVIDER_FIXTURE/home"
cat > "$PROVIDER_FIXTURE/.armature.json" <<EOF
{
  "providers": {
    "local": {
      "apiKey": "test-local-key",
      "baseURL": "http://127.0.0.1:$PORT_REFUSED/v1",
      "defaultModel": "qwen3:32b"
    }
  },
  "defaultProvider": "local"
}
EOF

PORT="$(node -e 'const net=require("node:net"); const s=net.createServer(); s.listen(0,"127.0.0.1",()=>{console.log(s.address().port); s.close();});')"
env -i PATH="$PATH" HOME="$TMP_HOME" ARMATURE_HOME="$TMP_HOME/.armature" ARMATURE_PROVIDER=openai OPENAI_API_KEY=test-openai-key \
  node dist/bin/armature.js serve --port "$PORT" >"$TMP_HOME/serve.out" 2>&1 &
SERVER_PID=$!
bash agent-eval/scripts/wait-for-http.sh "http://127.0.0.1:$PORT/health" "^(200)$" 50 0.1 >/dev/null

strip_ansi() {
  perl -pe 's/\e\[[0-9;]*[A-Za-z]//g'
}

capture() {
  local title="$1"
  local command="$2"
  {
    printf '## %s\n\n' "$title"
    printf '```bash\n%s\n```\n\n' "$command"
    printf '```\n'
    bash -lc "$command" 2>&1 | strip_ansi
    printf '\n```\n\n'
  } >> "$OUT_FILE"
}

cat > "$OUT_FILE" <<EOF
# Armature CLI Release Journey

- Run ID: \`${ARMATURE_EVAL_RUN_ID:-unknown}\`
- Generated At: \`$(date -u +"%Y-%m-%dT%H:%M:%SZ")\`
- Project Root: \`$REPO_ROOT\`

This artifact records a representative offline CLI journey for the release gate.

EOF

capture "Root Help" "cd \"$REPO_ROOT\" && node dist/bin/armature.js --help"
capture "Root Continue" "cd \"$REPO_ROOT\" && printf '/exit\\n' | env -i PATH=\"$PATH\" HOME=\"$TMP_HOME\" ARMATURE_HOME=\"$TMP_HOME/.armature\" ARMATURE_PROVIDER=openai OPENAI_API_KEY=test-openai-key ARMATURE_NO_INK=1 node dist/bin/armature.js -c"
capture "Run Help" "cd \"$REPO_ROOT\" && node dist/bin/armature.js run --help"
capture "PR Fetch Failure" "cd \"$REPO_ROOT\" && env -i PATH=\"$PR_FIXTURE/bin:$PATH\" HOME=\"$PR_FIXTURE/home\" node dist/bin/armature.js pr 123 2>&1; true"
capture "PR Checkout Failure" "cd \"$REPO_ROOT\" && env -i PATH=\"$PR_CHECKOUT_FIXTURE/bin:$PATH\" HOME=\"$PR_CHECKOUT_FIXTURE/home\" node dist/bin/armature.js pr 123 2>&1; true"
capture "Providers Test Failure" "cd \"$PROVIDER_FIXTURE\" && env -i PATH=\"$PATH\" HOME=\"$PROVIDER_FIXTURE/home\" ARMATURE_HOME=\"$PROVIDER_FIXTURE/home/.armature\" node \"$REPO_ROOT/dist/bin/armature.js\" providers test local"
capture "Providers Test Timeout" "PROJECT_DIR=\"$REPO_ROOT\" ARMATURE_EVAL_RUN_DIR=\"$RUN_DIR\" bash \"$REPO_ROOT/agent-eval/scripts/run-providers-test-timeout.sh\""
capture "Run Goal Loop Success" "PROJECT_DIR=\"$REPO_ROOT\" ARMATURE_EVAL_RUN_DIR=\"$RUN_DIR\" bash \"$REPO_ROOT/agent-eval/scripts/run-run-goal-loop-local-success.sh\""
capture "Session List" "cd \"$REPO_ROOT\" && env -i PATH=\"$PATH\" HOME=\"$TMP_HOME\" ARMATURE_HOME=\"$TMP_HOME/.armature\" node dist/bin/armature.js session list"
capture "Session Show" "cd \"$REPO_ROOT\" && env -i PATH=\"$PATH\" HOME=\"$TMP_HOME\" ARMATURE_HOME=\"$TMP_HOME/.armature\" node dist/bin/armature.js session show demo"
capture "Doctor JSON" "cd \"$REPO_ROOT\" && env -i PATH=\"$PATH\" HOME=\"$TMP_HOME\" ARMATURE_HOME=\"$TMP_HOME/.armature\" ARMATURE_PROVIDER=openai OPENAI_API_KEY=test-openai-key node dist/bin/armature.js doctor --json"
capture "Serve Health" "curl -sf \"http://127.0.0.1:$PORT/health\""
capture "Serve Providers" "curl -sf \"http://127.0.0.1:$PORT/providers\""
capture "Serve Doctor" "curl -sf \"http://127.0.0.1:$PORT/doctor\""
capture "Serve Chat Stream Success" "PROJECT_DIR=\"$REPO_ROOT\" ARMATURE_EVAL_RUN_DIR=\"$RUN_DIR\" bash \"$REPO_ROOT/agent-eval/scripts/run-serve-chat-stream-local-success.sh\""
capture "Serve Chat JSON Success" "PROJECT_DIR=\"$REPO_ROOT\" ARMATURE_EVAL_RUN_DIR=\"$RUN_DIR\" bash \"$REPO_ROOT/agent-eval/scripts/run-serve-chat-json-local-success.sh\""
capture "Installed Tarball Help" "TMP_INSTALL=\$(mktemp -d); npm pack --pack-destination \"\$TMP_INSTALL\" >/dev/null; TAR=\$(ls \"\$TMP_INSTALL\"/*.tgz | head -n1); PREFIX=\"\$TMP_INSTALL/prefix\"; npm install -g --prefix \"\$PREFIX\" \"\$TAR\" >/dev/null; \"\$PREFIX/bin/armature\" --help; rm -rf \"\$TMP_INSTALL\""

printf 'wrote %s\n' "$OUT_FILE"
