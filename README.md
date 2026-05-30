<div align="center">

# Orca CLI

### The only coding agent that races Claude, GPT, and Gemini on the same question.

Ask three frontier models at once. Have a judge pick the winner. Or chain them as specialists — Claude plans, GPT codes, Gemini reviews. No single-vendor CLI can do this.

[![npm](https://img.shields.io/npm/v/orca-cli.svg)](https://www.npmjs.com/package/orca-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-green.svg)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/tests-1776%20passing-brightgreen.svg)](#release-quality-gates)

</div>

```bash
npm install -g orca-cli
```

```bash
# One key, eleven models. Then:
orca council "is this code thread-safe?" -n 3   # 3 models answer, a judge picks the winner
orca race "write a CSV parser"                  # all models race, fastest good answer wins
orca pipeline "build auth middleware"           # Claude plans -> GPT codes -> Gemini reviews
```

> **Why this exists:** every other coding CLI locks you to one vendor's model. Orca treats
> models as interchangeable workers. For a hard question, one model is a guess — three models
> with a judge is an answer. Works with any OpenAI-compatible provider; one aggregator key
> (Poe / OpenRouter / Cloudflare AI Gateway) unlocks all of them.

## 30-second demo

```
$ orca council "is this code thread-safe?" -n 3

● claude-opus-4.6 ... 4.2s
● gpt-5.4 ........... 2.1s
● gemini-3.1-pro .... 3.8s

★ Verdict (claude-opus-4.6 as judge)
  All three agree: race condition on line 42. The mutex is released
  before the write completes. Confidence: HIGH (3/3 agree).
```

> Replace this block with a 10-second terminal-recording GIF of `orca council` before launch —
> it is the single highest-leverage asset for stars.

## What you get

- **Multi-model**: `council` (vote) · `race` (fastest) · `pipeline` (specialist chain) — the part nobody else has
- **Full agent**: 42 tools, 8 lifecycle hooks, background jobs, goal-loops (`--done-when "tests pass"`)
- **6 modes**: chat · reflect (Socratic debugging) · review · debug · architect · critique (adversarial gate)
- **Runs anywhere**: terminal REPL, one-shot, headless HTTP server, or MCP server over stdio
- **Production-hardened**: 1776 tests, shell-injection protection, fail-closed permissions, auditable release gates

## How Orca compares

|  | **Orca** | Claude Code | Codex CLI | aider |
|---|:---:|:---:|:---:|:---:|
| Providers | **11 (any OpenAI-compat)** | Anthropic only | OpenAI only | many |
| Council — N models + a judge vote | **✅** | ❌ | ❌ | ❌ |
| Race — fastest good answer wins | **✅** | ❌ | ❌ | ❌ |
| Specialist pipeline (plan→code→review) | **✅** | ❌ | ❌ | ❌ |
| Goal-loop (`--done-when`) | ✅ | ✅ | ✅ | ❌ |
| MCP host + MCP server | ✅ | ✅ | partial | ❌ |

The top three rows are the wedge. Everything else is table stakes — Orca just also has them.

## Multi-model collaboration — the part nobody else has

Orca reaches 11 models from 9 vendors through one API key. Three ways to put them to work:

### Council — `orca council`

Ask N models the same question. A judge synthesizes the best answer.

```bash
orca council "is this code thread-safe?" -n 3
orca council "review for security issues" -n 5 -j claude-opus-4.6
```

```
╭── Council: 3 models ──╮
● claude-opus-4.6 ... 4.2s
● gpt-5.4 ........... 2.1s
● gemini-3.1-pro .... 3.8s

★ Verdict (claude-opus-4.6 as judge)
  All three agree on the race condition in line 42...
  Confidence: HIGH (3/3 agree)
─ 3 models · 12.1s · agreement: high ─
```

### Race — `orca race`

N models race. First good answer wins, the rest are cancelled.

```bash
orca race "write a quicksort in Python" -n 5
```

### Pipeline — `orca pipeline`

Chain models as specialists. Each stage feeds the next.

```bash
orca pipeline "build auth middleware" --plan claude-opus-4.6 --code gpt-5.4 --review gemini-3.1-pro
```

| Stage | Default | Role |
|-------|---------|------|
| Plan | claude-opus-4.6 | Architecture, data flow, API design |
| Code | gpt-5.4 | Fast implementation |
| Review | gemini-3.1-pro | Bug / security / perf review (2M context) |
| Fix | gpt-5.4 | Address review findings |
| Verify | claude-opus-4.6 | Confirm the fix matches the plan |

For large PRs, `orca review-ledger` runs independent model reviews, synthesizes a deduplicated
Critical/High/Medium ledger, and gates every fix behind an explicit human decision.

## Providers — one key unlocks all

Works with any OpenAI-compatible endpoint. Configure in `~/.orca/config.json`.

```bash
# A single aggregator key gets you every vendor:
export POE_API_KEY=...           # Poe — all vendors via one endpoint
export OPENROUTER_API_KEY=...    # OpenRouter — same
export CLOUDFLARE_AI_GATEWAY_API_KEY=...   # Cloudflare AI Gateway

# Or use a vendor directly:
export ANTHROPIC_API_KEY=...  ·  export OPENAI_API_KEY=...  ·  export GOOGLE_API_KEY=...
```

| Provider | Type | API key |
|----------|------|---------|
| anthropic · google · openai | Direct | vendor key |
| poe · openrouter · cloudflare | Aggregator | one key, all vendors |
| deepseek · groq · xai · copilot | Direct | vendor key |
| local | Direct | Ollama at `localhost:11434` |

Aggregators are ideal for council / race / pipeline — one endpoint reaches every model. Routing
is aggregator-first with per-model direct fallback.

## Common commands

```bash
orca chat                                       # interactive REPL
orca chat "explain this codebase"               # one-shot
orca run "fix the failing tests" --done-when "tests pass"   # goal-loop until criteria met
orca reflect "why is this test flaky?"          # Socratic root-cause pass
orca review "review the changed files"          # code-review preset
orca council "SQL or NoSQL here?" -n 5          # multi-model council
orca race "write a CSV parser"                  # multi-model race
orca pipeline "build a REST API" --stages 5     # specialist pipeline
orca serve --mcp                                # expose Orca as an MCP server over stdio
orca doctor                                     # runtime / config diagnostics
```

Run `orca --help` or `/help` inside the REPL for the full surface (28 commands, session
management, queue/lease control, permission rules, stats, and logs).

## Release quality gates

A manifest-driven gate system for maintainers — release verification as a repeatable system,
not ad hoc shell history.

```bash
npm run eval:fast      # local black-box operator pack        (63/63)
npm run eval:nightly   # + deterministic lint / test / build  (66/66)
npm run eval:release   # + bench + recorded CLI journey       (69/69)
```

1776 automated tests across static / unit / contract / integration / e2e / security / resilience /
performance layers. `npm run test:matrix` writes a fresh evidence bundle under `outputs/test-matrix/`.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Orca CLI  v0.8.16  ·  TypeScript ESM  ·  1776 tests │
├─────────────────────────────────────────────────────┤
│  Command Layer   chat · run · council · race ·       │
│                  pipeline · serve                    │
├─────────────────────────────────────────────────────┤
│  Multi-Model Engine   council · race · pipeline ·    │
│                       provider-aware routing         │
├─────────────────────────────────────────────────────┤
│  Agent Runtime   42 tools · 8 hooks · background jobs │
├─────────────────────────────────────────────────────┤
│  ink Terminal UI   ScrollBox · InputArea · StatusBar  │
└─────────────────────────────────────────────────────┘
```

Resolution order: `CLI flags > ENV vars > .orca.json > ~/.orca/config.json`.

## Contributing

Contributions welcome. Open an issue to discuss before submitting large PRs.

```bash
git clone https://github.com/MARUCIE/orca-cli.git
cd orca-cli && npm install && npm run build && npm test && npm run eval:fast
```

## License

MIT

---

<p align="center"><sub>Maurice | maurice_wen@proton.me</sub></p>
