# Orca CLI Visual System Plan

## Purpose

This plan upgrades the local Orca CLI Ink interface into a recognizable terminal product identity. The target is the primary Orca surface, not a browser UI: startup banner, empty-state home panel, theme selection, status bar, transcript panels, and command affordances.

User request, 2026-04-30: optimize local Orca CLI, study Hermes Agent, create a distinctive visual system across typography, color, UI, and UX, design first, then execute through PDCA.

2026-05-02 correction: the startup deck must use a dominant `ORCA-AGENT` display wordmark and a clean Blackfin Signal state deck. The older compact `ORCA` lockup is no longer sufficient, and the later independent Orca icon/hero mark has been removed after operator feedback.

## Reference Read

Hermes Agent reference material:

- User screenshot: `Screenshot 2026-04-30 at 11.46.53 PM.png`
- Local source: `/Users/mauricewen/00-AI-Fleet/state/services/hermes-agent/src/hermes-agent/cli.py`
- Local source: `/Users/mauricewen/00-AI-Fleet/state/services/hermes-agent/src/hermes-agent/hermes_cli/banner.py`
- Local source: `/Users/mauricewen/00-AI-Fleet/state/services/hermes-agent/src/hermes-agent/hermes_cli/skin_engine.py`

Hermes design principles to learn, not copy:

1. Strong startup identity: a large display wordmark creates immediate recognition.
2. One memorable symbolic system: Hermes uses a caduceus; Orca should rely on the `ORCA-AGENT` wordmark, Blackfin Signal language, and restrained dorsal-fin / echolocation motifs instead of a startup mascot.
3. Tiered color language: title, border, accent, dim, body, and status states are separate semantic roles.
4. Content-first banner: the right side explains tools, skills, model, session, and update state.
5. Compact fallback: narrow terminals get a reduced but still branded banner.
6. Theme as data: visual choices must be tokenized instead of hard-coded ad hoc in each component.

## Direction

Name: `Blackfin Signal`

Concept: Orca as a killer-whale pod command surface. The interface should feel precise, predatory, and coordinated: blackfin / foam contrast, amber echolocation signal lights, and reef/kelp/coral accents for state and action.

Brand hierarchy:

1. Primary motif: killer whale / tiger whale. Use blackfin, white saddle / foam contrast, dorsal-fin silhouette, pod coordination, hunting precision, and echolocation.
2. Field motif: ocean. Use depth, current, wave pressure, cold water, reef / kelp / coral state colors, and signal propagation as the environment around the whale identity.
3. Product metaphor: pod intelligence. Orca CLI should feel like coordinated operator work in a terminal, not like a generic ocean-themed UI.

Rule: ocean imagery supports Orca; it must not become the primary brand. Avoid generic "deep sea" language unless it is tied back to killer-whale motion, pod behavior, or echolocation.

Tone:

- industrial and refined, not playful
- terminal-native, not web-card decorative
- high-contrast and operational
- memorable through a wordmark + dorsal-fin / echolocation motif rather than generic cyberpunk glow

Differentiator:

The first screen should be identifiable from across the room: a block `ORCA-AGENT` display mark and a clean mission-control layout that makes trust, model, session, tools, and recovery paths visible before the user types.

## Typography

CLI cannot load fonts; the terminal owns the actual typeface. Orca should still define a typography system:

| Role | Implementation | Intent |
| --- | --- | --- |
| Display wordmark | Fixed block-letter `ORCA-AGENT` glyph lines | Brand identity, equivalent to a display font |
| Signal labels | Uppercase short labels such as `MODEL`, `TRUST`, `QUEUE`, `RECOVER` | Fast scanning in a terminal |
| Body copy | Existing terminal monospace | Dense operational text |
| Prompts / commands | Accent-colored command spans | Make action paths easy to identify |
| Metadata | Dim bronze / slate tokens | Preserve hierarchy without hiding important state |

Recommended local terminal fonts for the user:

- Berkeley Mono, Commit Mono, or JetBrains Mono for the body terminal face
- Avoid proportional fonts and overly decorative patched fonts for the primary Orca session

## Palette

Use semantic tokens, not color-by-component.

| Token | Color | Usage |
| --- | --- | --- |
| `signal` | `#F6C945` | wordmark, focused border, echolocation prompt |
| `brass` | `#B8792F` | secondary labels, dividers, dim accent |
| `abyss` | terminal background | implicit field, no forced background |
| `foam` | `#E8E2D0` | primary text on dark terminals |
| `reef` | `#47BFB0` | model/provider/info highlights |
| `kelp` | `#72A276` | success and healthy context |
| `coral` | `#E45A3C` | errors and destructive states |
| `warning` | `#F6A63A` | warnings and plan-mode caution |
| `ice` | `#9DB2BF` | muted metadata |

Rationale:

- Hermes's yellow/gold signal is retained only as a lesson in recognizability.
- Orca adds blackfin / oceanic secondary colors so the interface does not become a one-note yellow theme.
- Purple/blue gradients, glass effects, and generic cyan-on-dark are explicitly avoided.

## UI System

### Banner

Replace the small swimming art as the main identity with a brand lockup:

- block `ORCA-AGENT` wordmark
- no independent startup mascot/icon/hero mark
- version, model, directory, permission, tools, config, session, and fleet state
- compact fallback for terminals under the art width

The Banner follows Hermes's structural lesson without copying Hermes: strong first-frame wordmark hierarchy, themed status data, and compact fallback behavior. It does not render a separate icon-like figure.

### Home Panel

Shift from generic "Start Here" copy to a control-deck layout:

- `POD BRIEF`: one primary action, with examples framed as commands the operator can delegate
- `POD SIGNAL`: trust, mode, effort, model, session, tool surface
- `RECOVER`: continue, sessions, evidence, doctor, models
- `GUARDRAILS`: common failure paths and safe-mode action

This keeps the current UX principle of one primary action while making the page feel owned by Orca.

### Status Bar

Keep the 3-line shape, but tune the language:

- `ORCA POD` instead of plain `ORCA`
- model + sonar-labeled context bar remain first-line scannable
- metrics line should read as `signal:` when cost, throughput, turns, session, policy, output, or sparkline evidence exists
- permissions line should read as `trust:`, preserving source, mode, effort, and shift-tab cycling guidance

### Theme Picker

Introduce `Blackfin Signal` as the default theme and first picker option. Preserve existing alternate themes for user choice.

### Command And Input Surface

Carry the same Orca identity into the high-frequency operation surfaces:

- `PickerFrame` is theme-aware and uses the active Orca semantic border, title, subtitle, and footer tokens.
- `CommandPicker` is framed as `POD COMMANDS`, with `echo filter` language, compact key hints, and a visible no-match state.
- `OptionPicker` uses Orca tokens for selected rows, filter labels, descriptions, and scroll affordances.
- `InputArea` uses pod-brief language so the empty prompt asks the operator to brief the pod rather than type into a generic message box.

This keeps slash commands and pickers ordinary and discoverable while making the surface unmistakably Orca.

### Transcript Flow

Carry the pod identity into the running conversation:

- submitted prompts render as `POD BRIEF`
- assistant response panels render as `ORCA POD`
- streaming assistant state reads as `echoing`
- active and completed tool rails carry the `ECHO TOOL` label
- thinking state uses concise pod / proof / signal verbs instead of generic playful spinner verbs

The transcript should feel like an operational exchange: brief, response, scan, evidence. It must still preserve exact submitted text, markdown structure, tool names, paths, result states, and durations.

### Proof Wake

Carry the identity into the post-turn summary:

- completed turns leave a `PROOF WAKE`
- metrics read as `time`, `in`, `out`, `tools`, cost, and `tok/s`
- the summary remains compact and does not change accounting, event payloads, or provider behavior

### Trust Gate

Carry the identity into approval and write-review boundaries:

- permission prompts read as `TRUST GATE`
- tool impact preview sits under `SCAN` before allow/deny choices
- approval choices explain trust scope: once, session, project policy, or deny
- write previews read as `ECHO DIFF`
- trust-gate language must not change policy semantics, approval keybindings, diff computation, or runtime events

### Evidence Drawer

Carry the identity into detail panels:

- detail panels read as `EVIDENCE DRAWER`
- the original source title remains visible after the Orca frame label
- subtitle metadata gains a compact `pod scan` prefix
- info / warning / error borders use theme semantic tokens
- markdown evidence rendering remains unchanged

### Council Runway

Carry the identity into multi-model progress:

- council, race, and pipeline progress read as `POD COUNCIL`
- model count is framed as pod `voices`
- completed model work is marked as `surfaced`
- active model work is marked as `sonar`
- progress colors use theme semantic tokens instead of hard-coded terminal colors

### Helm Footer

Carry the identity into the persistent shortcut footer:

- shortcut guidance starts with `POD HELM`
- generating state reads as `esc interrupt echo`
- active and idle states use `send brief` and `pod commands`
- permission-mode hints remain visible through `shift+tab`
- ordinary-width terminals keep core hints coherent; lower-priority active hints only appear when width allows
- footer identity, keys, and labels use theme semantic tokens

### Interaction

No new interaction framework. Reuse existing Ink components:

- `PickerFrame`
- `OptionPicker`
- `CommandPicker`
- `HomePanel`
- `StatusBar`
- `InputArea`
- `Footer`

## Constraints

- No new dependencies.
- No browser UI.
- No mock data for verification.
- Narrow terminals must not wrap into incoherent text.
- Existing dirty worktree changes must not be reverted.
- Generated `dist/` is build output; source changes land in `src/`.

## PDCA Execution

| Phase | Action | Evidence |
| --- | --- | --- |
| Plan | Add this design plan, update task plan, rolling ledger, and active PDCA docs | `ORCA_VISUAL_SYSTEM_PLAN.md`, `ORCA_VISUAL_SYSTEM_PLAN.html` |
| Do | Tokenize the new theme and update Banner, HomePanel, ThemePicker, StatusBar copy | `src/ui/theme.tsx`, `src/ui/components/*` |
| Check | Run focused Ink tests, typecheck/build, then real CLI smoke with `ORCA_THEME=orca` | `tests/ink-ui.test.tsx`, `npm run build`, `node dist/bin/orca.js --version`, captured output |
| Act | Sync PRD, architecture, UX map, optimization plan, checklist, notes, deliverable, rolling ledger | active initiative docs |

## Acceptance Criteria

- Default dark theme resolves to `orca` / `Blackfin Signal`.
- The banner contains a distinctive `ORCA` wordmark and signal motif.
- HomePanel uses mission-control language while preserving one primary action.
- ThemePicker exposes `Blackfin Signal` first and still supports existing themes.
- Command and option pickers inherit semantic theme tokens and use `POD COMMANDS` / echo-filter language.
- The input placeholder uses pod-brief wording without changing submit behavior.
- Transcript blocks use `POD BRIEF`, `ORCA POD`, and `ECHO TOOL` while preserving content and status details.
- Turn summaries use `PROOF WAKE` while preserving elapsed time, token flow, tool count, cost, and throughput.
- StatusBar uses `sonar`, `signal:`, and `trust:` language while preserving model, context, branch, metrics, permissions, mode, and effort.
- Footer uses `POD HELM`, `interrupt echo`, `send brief`, and `pod commands` while preserving shortcut behavior and ordinary-width readability.
- Focused Ink tests pass.
- `npm run lint` and `npm run build` pass.
- A real CLI command confirms the package still runs.
