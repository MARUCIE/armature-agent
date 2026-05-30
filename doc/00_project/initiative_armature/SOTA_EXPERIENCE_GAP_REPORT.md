# Armature CLI SOTA Experience Gap Report

- Initiative: `armature`
- Date: `2026-04-20`
- Scope: terminal/agent experience comparison across `Claude Code`, `Codex`, `Amp`, `Kilo Code`, `OpenCode`, and `GitHub Copilot`
- Goal: identify learnable interaction, feature, and performance deltas that should reshape Armature CLI's roadmap

## 1. Research Method

### 1.1 Sources

Primary sources used for this report:

- Anthropic Claude Code docs
  - https://docs.anthropic.com/en/docs/claude-code/overview
  - https://docs.anthropic.com/en/docs/claude-code/sub-agents
  - https://docs.anthropic.com/en/docs/claude-code/hooks
  - https://docs.anthropic.com/en/docs/claude-code/mcp
- OpenAI Codex official assets
  - https://github.com/openai/codex
  - local CLI snapshot: `codex --help` on this machine (`codex-cli 0.121.0`)
- Amp official assets
  - https://ampcode.com/manual
  - local CLI snapshot: `/Users/mauricewen/.amp/bin/amp --help`
- Kilo Code docs
  - https://kilo.ai/docs
- OpenCode official docs
  - https://opencode.ai/docs
  - local CLI snapshot: `opencode --help` (`1.2.27`)
- GitHub Copilot official docs
  - https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-copilot-cli
  - local CLI snapshot: `gh copilot --help`

### 1.2 Evidence Classes

- `direct-doc`: explicitly documented by the official product source
- `local-cli`: verified from the local CLI installed on this machine
- `inference`: architectural conclusion drawn from the official docs and CLI surface, not a published benchmark

### 1.3 Important Caveat

- `Amp` and `copilot` shell aliases in `AI-Fleet` are wrapper entrypoints. For performance notes, this report uses the native `Amp` binary and `gh copilot`, not the wrapper scripts.
- `Kilo Code` behaves primarily as an IDE-first product. It is included as a SOTA experience reference, not as a 1:1 terminal-native peer.

## 2. Armature Baseline

Current Armature strengths before new work:

- strong provider-neutral runtime with built-in multi-model council/race/pipeline
- mature local verification discipline:
  - `npm test` => `1428/1428`
  - `npm run lint` => pass
  - `npm run build` => pass
- explicit REPL/TUI investments:
  - status bar
  - command palette
  - session persistence
  - MCP integration
  - hook system
  - provider-aware model metadata
- latest UX tranche already landed:
  - unified finite-choice picker
  - searchable picker flows for thread/note/prompt/postmortem discovery

Current Armature weakness pattern:

- terminal experience is improving rapidly but still feels like a powerful custom CLI rather than an ecosystem-grade operating surface
- strongest deltas are not raw capability gaps; they are workflow packaging gaps:
  - session lifecycle
  - share/export/remote handoff
  - IDE/browser/collaboration bridges
  - explicit performance instrumentation

## 3. Measured Local CLI Startup Reference

These are `--help` cold-start timings on this machine. They are not product-lab benchmarks. They are useful only as a directional operator-experience signal.

| Product | Local command | Time | Evidence |
| --- | --- | ---: | --- |
| Armature CLI | `node dist/bin/armature.js --help` | `287.2ms` | local-cli |
| Claude Code | `claude --help` | `520.6ms` | local-cli |
| Amp CLI | native `/Users/mauricewen/.amp/bin/amp --help` | `936.1ms` | local-cli |
| GitHub Copilot CLI | `gh copilot --help` | `1223.5ms` | local-cli |
| OpenCode | `opencode --help` | `2230.4ms` | local-cli |
| Codex CLI | `codex --help` | `3404.9ms` | local-cli |
| Kilo Code | no standalone local CLI benchmark captured | `n/a` | local-cli |

Interpretation:

- Armature already has a strong local startup/help path relative to the installed peers on this machine.
- startup speed is **not** Armature's biggest SOTA gap.
- workflow composition and operator confidence are the bigger gaps.

## 4. Product-by-Product SOTA Read

### 4.1 Claude Code

What stands out:

- broad operational surface: interactive, print mode, stream-json, worktrees, session resume/fork, MCP config, plugins, hooks, custom agents, IDE/Chrome integration
- very explicit permission and tool-control vocabulary
- strong “operating system for coding agents” feel instead of “single REPL with tools”

Where Armature is weaker:

- Armature lacks the same density of first-class workflow toggles around sessions, agents, permissions, and environment shaping
- Armature's plugin/agent ecosystem is much thinner
- Armature does not yet expose as many “operator trust” controls on the CLI surface itself

Learnable difference:

- Claude Code treats configuration, approvals, sessions, agents, and integrations as equally important user-facing primitives

### 4.2 Codex

What stands out:

- explicit sandbox/approval model exposed right in top-level flags
- rich lifecycle commands:
  - `resume`
  - `fork`
  - `cloud`
  - `app`
  - `mcp`
  - `sandbox`
  - `apply`
- strong “session as durable object” model
- local OSS provider path plus remote/cloud task bridge

Where Armature is weaker:

- Armature has session persistence but not the same visible fork/resume/cloud/app mental model
- Armature lacks a first-class “apply remote diff locally” or “cloud tasks” story
- Armature's trust/sandbox language is less crisp than Codex's top-level command/flag model

Learnable difference:

- Codex packages remote, local, cloud, app, and sandbox concerns into a single coherent operator surface

### 4.3 Amp

What stands out:

- thread-centric workflow is unusually mature:
  - list/search/share/rename/archive/delete/export/handoff
- explicit permissions management command group
- strong skill/tool/MCP surfacing
- review is a first-class top-level command

Where Armature is weaker:

- Armature has sessions and threads, but not the same “threads are the core unit of work and collaboration” maturity
- Armature lacks share/handoff/visibility style collaboration concepts
- Armature's permission UX is improving, but Amp exposes policy management more concretely as an administrative workflow

Learnable difference:

- Amp turns conversation history into a collaborative workflow object, not just a local continuation record

### 4.4 Kilo Code

What stands out:

- IDE-first emphasis on modes, checkpoints, model selection, and structured AI-assisted coding flow
- strong “mode system as product” posture
- more explicit long-horizon coding controls than a simple chat surface

Where Armature is weaker:

- Armature has modes, but the surrounding workflows are thinner
- Armature lacks checkpoint-style recovery/branching ergonomics
- Armature does not yet turn “mode changes” into broader workflow templates

Learnable difference:

- Kilo treats model/mode/workflow choice as a guided operational decision instead of assuming the user should always type the next command

### 4.5 OpenCode

What stands out:

- broad surface beyond pure terminal:
  - TUI
  - headless server
  - web
  - ACP
  - session export/import
  - GitHub agent
- strong provider/session/server framing
- explicit path from local interactive use to connected tooling/web workflows

Where Armature is weaker:

- Armature has serve mode, but not a comparably packaged web/headless parity story
- Armature lacks import/export/session portability ergonomics
- Armature's collaboration/hosting story is much thinner

Learnable difference:

- OpenCode frames the terminal as one client among several, not as the whole product

### 4.6 GitHub Copilot

What stands out:

- narrow but very clear terminal promise:
  - explain commands
  - suggest commands
- low cognitive load
- strong GitHub ecosystem gravity for review, coding agent, and code review workflows outside the CLI itself

Where Armature is weaker:

- Armature is much more powerful, but it is not always simpler for quick jobs
- Armature still lacks a sharply separated “quick assistant” lane for minimal-friction use

Learnable difference:

- SOTA experience is not only about more commands; it is also about clearer mode separation for novice vs power use

## 5. Gap Matrix: Armature vs SOTA

| Dimension | Current Armature | SOTA reference | Armature gap |
| --- | --- | --- | --- |
| Command discoverability | improving picker + search picker | Claude Code, Codex, Amp | medium |
| Session lifecycle | save/load/continue + threads | Codex, Amp, OpenCode | high |
| Session branching/forking | limited | Claude Code, Codex | high |
| Collaboration/share/handoff | minimal | Amp, OpenCode, GitHub Copilot ecosystem | high |
| Approval model clarity | present but thinner | Claude Code, Codex, Amp | medium-high |
| Workflow packaging | many features, less productized | Claude Code, Codex, Kilo | high |
| IDE integration | limited | Claude Code, Amp, Kilo, GitHub Copilot | high |
| Browser / web / remote surface | partial serve only | Claude Code, Codex, OpenCode | high |
| Plugin / marketplace ecosystem | thin | Claude Code, Codex, Amp | high |
| Model/provider routing | strong | Armature is competitive here | low |
| Built-in multi-model collaboration | strong lead | most peers weaker | Armature leads |
| Performance instrumentation | weak | few publish this, but Codex/Claude expose stronger operator controls | medium-high |
| Quick-use low-cognitive lane | weak | GitHub Copilot CLI | medium |

## 6. Ranked SOTA Gaps

### P0 — Must close

1. **Session lifecycle needs to become a product, not just storage**
   - add fork/branch/share/export/import/handoff semantics
2. **Approval/trust/sandbox UX needs a clearer top-level story**
   - make policies visible and switchable without hidden mental state
3. **Workflow packaging is behind frontier CLIs**
   - modes need stronger task-oriented presets and clearer outcomes
4. **Search/inspect flows still stop at selection**
   - move from “pick an item” to “inspect and act on an item”

### P1 — High-value ecosystem gaps

5. **Remote/headless/web parity**
   - evolve `serve` from diagnostics endpoint into a real remote client/server story
6. **IDE context ingestion**
   - bridge terminal and editor state more directly
7. **Share/export/handoff**
   - make conversation and task artifacts portable across users and tools

### P2 — Differentiators to strengthen

8. **Make Armature's multi-model lead feel first-class in UX**
   - better operator surfaces for routing, comparison, and arbitration
9. **Performance instrumentation**
   - publish startup, render, turn, and tool timings as user-visible diagnostics
10. **Quick-use lane**
   - create a very low-friction “explain/suggest/one-shot” path for shallow tasks

## 7. Recommended SOTA Learning Agenda

### Learn from Claude Code

- permission modes as first-class UX
- hooks/plugins/MCP/agents as visible product surfaces
- session/worktree/fork operator ergonomics

### Learn from Codex

- crisp sandbox language
- remote/local/cloud/app continuity
- session picker + fork/resume as baseline, not advanced feature

### Learn from Amp

- thread-first collaboration
- handoff/share/export semantics
- permissions as manageable policy, not just inline prompt

### Learn from Kilo

- mode-centric workflow packaging
- checkpoint-oriented recovery
- guided model/mode selection

### Learn from OpenCode

- headless/web parity
- session portability
- terminal as one client among several

### Learn from GitHub Copilot

- simpler low-cognitive quick tasks
- very clear terminal value proposition

## 8. Recommended Armature PDCA Program

### Wave 0 — Already in motion

- unified finite-choice picker
- searchable picker flows
- consistent picker shell

### Wave 1 — Session and artifact operating system

- add `fork`, `export`, `import`, `share`, `handoff` for Armature sessions/threads
- add inspect panels for selected search results
- add explicit latest/recent session pickers at top-level entrypoints

### Wave 2 — Trust and approval operating system

- expose approval/sandbox/trust policies as explicit user-facing commands
- add richer permission review panels with scoped explanations and remembered policy choices

### Wave 3 — Workflow packaging

- introduce task-oriented modes/presets:
  - review
  - debug
  - ship
  - research
  - quick assist
- show what each preset changes: model, tools, permissions, output style

### Wave 4 — Remote and ecosystem reach

- evolve `serve` into a real remote workflow surface
- add session portability and collaboration primitives
- expand IDE/editor bridges

### Wave 5 — Performance and operator evidence

- ship visible performance telemetry:
  - startup
  - prompt ready
  - tool latency
  - model first token
  - turn total
- add benchmark/report artifacts for UX performance, not just task correctness

## 9. Immediate Optimization Recommendation

If only the next 3 items are executed:

1. session fork/export/share/handoff
2. inspect-and-act detail panels for search results
3. explicit approval/sandbox control surface

That would close more visible SOTA experience debt than another round of narrow TUI polish.

## 10. Bottom Line

Armature is **already competitive** on:

- provider-neutrality
- multi-model collaboration
- verification discipline
- local startup/help performance

Armature is **not yet SOTA** on:

- session lifecycle productization
- trust/approval operating surface
- collaboration and artifact portability
- remote/web/IDE continuity
- workflow packaging clarity

The next meaningful leap is not “more commands.” It is turning Armature from a powerful terminal runtime into a **coherent agent operating surface**.
