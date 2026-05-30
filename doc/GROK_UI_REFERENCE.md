# Grok Build TUI — Visual Reference (for the armature-agent pixel-port)

Reference target: **Grok Build v0.2.8** (xAI), installed at
`~/.grok/downloads/grok-0.2.8-macos-aarch64`. Renderer = Rust crate
`xai-grok-pager` (full-screen TUI). Palette + architecture extracted from the
binary (`strings`) and `~/.grok/docs/user-guide/06-theming.md`.

This doc is the canonical spec the ink port maps onto. armature-agent renders with
**ink** (React + Yoga flexbox), so we replicate grok's *visual language*, not its
custom renderer. Renderer-engine features are listed as out-of-scope at the end.

---

## 1. Themes

Grok ships 5 themes (4 documented + `oscura-midnight` found in the binary). The
default dark theme is **GrokNight**.

| Theme | Aliases | Character |
|-------|---------|-----------|
| GrokNight | `groknight`, `grok-night`, `dark` | Neutral gray base + brand accents. Default. |
| GrokDay | `grokday`, `grok-day`, `light`, `day` | Light theme for bright terminals. |
| TokyoNight | `tokyonight`, `tokyo-night`, `tokyo` | Blue-tinted Tokyo Night palette. |
| RosePineMoon | `rosepine`, `rose-pine-moon` | Warm muted Rose Pine family. |

### Grok brand accent colors (extracted from binary)

These distinctive hex values are grok's brand identity, used as the GrokNight/GrokDay accent roles:

- Brand purple: `#7d4bc6` (bright `#b267e6`, dark `#6c3eb2`)
- Brand blue: `#2f64d2` (mids `#4a72b0` `#5580a8` `#6183bb` `#9abdf5`)
- Brand teal: `#0f87a2` (`#0082aa` `#449dab`)
- Brand green/success: `#0a8e70` `#0c947c` `#378e23`
- Brand red/error: `#cd3048` (`#b82040` `#af2323` `#ed2551`)
- Brand orange/warning: `#c3691e` `#a27612` `#ffdb69`
- Neutral grays: `#0e0e0e` `#171717` `#1a1a1a` `#222222` `#383838` `#444444` `#525252` `#707070` `#808080` `#909090` `#a3a3a3` `#c8c8c8` `#e0e0e0` `#e8e8e8`

### GrokNight (default) — slot map

```
bg_base      #131313   (terminal default, near-black neutral)
bg_light     #1a1a1a
bg_dark      #0e0e0e
bg_highlight #222222
text_primary #e8e8e8
text_secondary #c8c8c8
gray_dim     #525252
gray         #808080
gray_bright  #a3a3a3
accent_user      #7d4bc6   (purple — your prompts)
accent_assistant #c8c8c8   (neutral bright — grok messages; grok keeps assistant text neutral)
accent_thinking  #6c3eb2   (muted purple)
accent_tool      #0f87a2   (teal)
accent_execute   #c3691e   (orange — shell run)
accent_plan      #2f64d2   (blue)
accent_skill     #b267e6   (bright purple)
accent_system    #909090   (gray)
accent_error     #cd3048
accent_success   #0a8e70
accent_running   #c3691e
accent_model     #0c947c
warning          #a27612
path/filePath    #4a72b0
command/code     #c8c8c8
diff_insert_fg   #0a8e70
diff_delete_fg   #cd3048
diff_equal_fg    #808080
```

### TokyoNight — slot map (canonical Tokyo Night, hex confirmed in binary)

```
bg_base      #1a1b26
bg_light     #1e202e
bg_dark      #16161e
bg_highlight #292e42
text_primary #c0caf5
text_secondary #a9b1d6
gray_dim     #51597d
gray         #565f89
gray_bright  #9aa5ce
accent_user      #bb9af7   (purple)
accent_assistant #c0caf5   (fg)
accent_thinking  #9d7cd8
accent_tool      #7dcfff   (cyan)
accent_execute   #ff9e64   (orange)
accent_plan      #7aa2f7   (blue)
accent_skill     #bb9af7
accent_system    #565f89
accent_error     #f7768e
accent_success   #9ece6a
accent_running   #e0af68
accent_model     #73daca   (teal)
warning          #e0af68
path/filePath    #7aa2f7
diff_insert_fg   #9ece6a
diff_delete_fg   #f7768e
diff_equal_fg    #565f89
```

### GrokDay (light) — slot map

```
bg_base      #fafafa
bg_light     #f0f0f0
bg_dark      #e8e8e8
text_primary #1a1a1a
text_secondary #383838
gray         #707070
accent_user      #6c3eb2
accent_assistant #1a1a1a
accent_thinking  #7d4bc6
accent_tool      #0f87a2
accent_execute   #c3691e
accent_plan      #2f64d2
accent_error     #af2323
accent_success   #148320
accent_model     #0a8e70
warning          #a27612
```

### RosePineMoon — slot map (canonical Rose Pine Moon)

```
bg_base      #232136
bg_light     #2a273f
bg_dark      #1f1d2e
bg_highlight #393552
text_primary #e0def4
text_secondary #908caa
gray         #6e6a86
accent_user      #c4a7e7   (iris)
accent_assistant #e0def4
accent_thinking  #c4a7e7
accent_tool      #9ccfd8   (foam)
accent_execute   #f6c177   (gold)
accent_plan      #3e8fb0   (pine)
accent_error     #eb6f92   (love)
accent_success   #3e8fb0
accent_model     #9ccfd8
warning          #f6c177
```

---

## 2. Layout & block visual language

Two regions: **scrollback** (top, conversation) + **prompt** (bottom input).
No giant ASCII wordmark on the welcome screen — grok's welcome is minimal: a
light top bar (worktree, `ctrl+q quit`), tier line, and the prompt placeholder
**"Type a message…"**.

Every scrollback entry is a **block with a left vertical accent line** (not a
full border box). The accent color encodes the block type:

| Block | Accent slot | Bullet/header |
|-------|-------------|---------------|
| User prompt | `accent_user` | left accent bar, sticky header when scrolled |
| Assistant message | `accent_assistant` | left accent bar, markdown body |
| Thinking | `accent_thinking` | header `Thinking…`, animated accent line, collapsible |
| Tool call | `accent_tool` | diamond bullet `◆`, muted when collapsed, dim parens for details |
| Execute (shell) | `accent_running`/`accent_execute` | `Run` label header, accent line animated while running |
| Edit (diff) | diff colors | inline diff, hunk separator `...`, gutter |

Tool bullet styles available (default = `diamond` ◆): `none`, `dot` (·),
`small-circle` (•), `circle` (●), `small-triangle` (‣), `triangle` (▶),
`diamond` (◆).

Prompt input widget: shows a prompt prefix char, placeholder "Type a message…",
collapses when scrollback is focused. Cursor color is set to `accent_user` via
OSC 12.

Footer/hints: minimal, e.g. `ctrl+q quit`, `submit`, slash-command hints — no
heavy themed label band.

---

## 3. armature → grok mapping (what changes in this port)

| armature current ("Blackfin Signal / Pod") | grok target |
|---|---|
| Giant `ARMATURE-AGENT` ASCII wordmark + bordered signal deck | minimal welcome header, no wordmark |
| amber/gold default theme `#F6C945` | GrokNight neutral-gray default |
| full-border boxes per block (round/single) | left vertical accent line per block |
| labels `POD BRIEF` / `ARMATURE POD` / `ECHO TOOL` / `POD HELM` | neutral, diamond bullet for tools |
| placeholder `Brief the pod…` | `Type a message…` |
| spinner only | `Thinking…` header |

---

## 4. Out of scope (renderer-engine, not feasible in ink without a rewrite)

ink is declarative React on Yoga flexbox; it has no custom scrollback pager.
These grok features are documented as out-of-scope for the visual port:

- Animated accent "wave" effect (30fps, `wave_rows`)
- Custom scrollbar with thumb (`scrollback.scrollbar`)
- Sticky pinned headers via a scrollback engine
- Mouse hover highlight on blocks, alt-screen pager fold/expand per-entry
- OSC 12 cursor recolor on theme switch (terminal-level; optional follow-up)

These are engine features, not visual-language tokens; the port replicates the
look (palette, accent lines, bullets, headers, placeholders), which is the
"pixel-level" surface a user sees in a static frame.
