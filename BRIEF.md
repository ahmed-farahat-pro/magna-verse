# MagnaVERSE — build brief for the 5 interactive app designs

You are building **one** of five self-contained HTML files. Each is a working, interactive
prototype of the MagnaVERSE enterprise AI chat app (on-prem / sovereign ChatGPT for Magna).

Read this whole file. Everything in §2, §3 and §4 is **mandatory in every app**.
§5 tells you which app you are building and what makes it different.

---

## 1. What the product is

MagnaVERSE is Magna's enterprise AI workspace. It looks like ChatGPT, but inference runs on
Magna's own GPUs (on-prem "Private" tier) instead of a public cloud. That sovereignty is the
whole reason a customer buys it. Users are enterprise staff in Saudi Arabia — procurement
leads, delivery managers, engineers, compliance officers.

Real product facts to use as content (do not invent competing facts):

- **Models available:** `Kimi K2 Instruct` (1T MoE, default), `DeepSeek V3.1`,
  `Qwen 3 235B`, `NVIDIA Nemotron 120B`. All run private.
- **Sovereignty tiers:** `Private` (active, Magna cluster Riyadh DC-1, 8×H200),
  `Public` (leaves your network). `Personal` (on-device) and `In-Country` ship in Q4 —
  show them as *dated roadmap*, never as dead greyed-out menu items.
- **Connectors / knowledge:** SAP S/4HANA, Primavera P6, Jira, Company Knowledge (8,400 docs),
  HR system. **MCP servers:** `sap-po-lookup`, `jira-search`, `p6-schedule`, `confluence`.
- **Skills:** 18 available, e.g. `heartbeat`, `jira-ticket-definer`, `hse-digest`.
- **Digital twin:** "Agentic Twin / TrendIQ" — 16 context sources across Structural,
  Behavioural, Dynamics & Intent. Currently 7 connected · 6 partial · 3 missing.
- **User:** Ahmad Farahat, Magna · Riyadh. Today is 16 Aug 2026.

---

## 2. The fix-list — every app must demonstrably fix all of these

These come from a hands-on audit of `app.stag.magna.ai` v1.0.491 plus the client's own
review notes. An app that does not visibly fix these has failed the brief.

### From the client's review document (highest priority — these are the client's own words)

| # | Problem today | What your app must do |
|---|---|---|
| D1 | A global top header bar (logo, search, sovereignty dropdown, bank/bell/info/gear icons) eats vertical space | **No global header.** Follow ChatGPT/Claude: everything lives in the left sidebar or in a small in-context control. Any per-thread state sits in a slim thread bar, not an app-wide chrome bar. |
| D2 | The Share button renders on its own line below the message, and the message footer collides with scrolling | **One anchored action row** per message: Copy · Retry · Export · Share. Never a lone floating icon. Scrolling must be contained to the transcript region. |
| D3 | Body text renders on a Riyadh skyline photo at 50% overlay — contrast fails | **Static, solid, token-driven background.** Optionally a Saudi-green tinted variant with shades. Never a photo behind body copy. |
| D4 | Switching light/dark reloads a big background image and is slow | Theme switch must be **instant** — CSS custom properties only, no image loads. Offer an animated **CSS/SVG** backdrop (no raster) as the only "decorative" option. |
| D5 | A 3D robot mascot floats over the composer and blocks the send button | **No mascot.** Remove it entirely. |
| D6 | Step tracker (`Planning › Searching › Generating › Done`, `FINAL RETURN`, `Final step completed without captured I/O.`) sits expanded above every answer | Collapse to **one quiet line** ("Thought for 6s · searched 2 docs") that expands on click. Never show `FINAL RETURN` or Langfuse internals to an end user. |
| D7 | Model names read `Latest Kimi`, `Latest Qwen`, `Latest DeepSeek` | Show **full model identity**: `Kimi K2 Instruct · 1T MoE`, `Qwen 3 · 235B`, etc. |
| D8 | Settings is a sprawling panel with hue/saturation/lightness sliders and film grain | Rebuild settings **like Claude's or ChatGPT's**: a modal, left category list, right pane, plain rows. Clear over impressive. No raw HSL sliders on the main path. |
| D9 | Reply text formatting is poor; math, code and diagrams break | See §3. This is the single biggest one. |
| D10 | The onboarding tour appears on **every** login | Tour shows **once**, dismissible, with a "Replay tour" entry in Help/Settings. Represent this in the UI (e.g. a first-run card that can be dismissed, and state that persists). |
| D11 | Client wants the Magna brand mark (red / blue / green) as an animated backdrop | Provide an **animated SVG/CSS** Magna-mark backdrop as a selectable appearance option — subtle, behind the sidebar or empty state only, never behind body text. |
| D12 | No clear way to discover or use MCP servers | Typing **`/`** in the composer opens a slash menu listing skills **and** MCP servers with descriptions, filterable as you type. Show what each one does. |

### From the walkthrough audit

| # | Problem today | What your app must do |
|---|---|---|
| A1 | Chat history is 3 levels deep (Chat → History → expand), titles cut to 18 chars | Permanent sidebar rail, full titles, date groups (Today / Yesterday / Last week). |
| A2 | No copy button anywhere | Copy on every message **and** every code block, with visible "Copied" feedback. |
| A3 | Prompt chips (Analyze / Automate / Create / Simulate) silently **send** a 30-word question you never wrote | Chips **pre-fill the composer** with an editable draft. Nothing sends without an explicit action. |
| A4 | Answers cite sources in prose with no links | Numbered inline citations + a source list that separates **web** from **internal** knowledge. |
| A5 | 13 of 26 nav destinations are greyed out; the highlighted "Upcoming" section is 0/5 working | Ship only working destinations. Roadmap belongs in Help, not primary nav. |
| A6 | Sovereignty is an abstract dropdown; nothing warns you when moving internal data to Public | Tier picker that states where it runs and what leaves; a **guardrail confirm** before switching a thread containing internal files to Public. |
| A7 | Focus is dropped after closing the command palette | Composer must regain focus after any overlay closes. |
| A8 | Empty states say only "Nothing here yet" | Every empty state explains what the thing is and offers one concrete action. |

---

## 3. Answer rendering (D9) — the make-or-break requirement

The live app ships raw LaTeX (`$\int x^3 , dx$` as literal text, dozens of lines), draws
flowcharts in box-drawing characters, and renders code as a bare rectangle with no copy
button. Every app you build must show a transcript that **proves these are fixed**:

1. **Math** — at least one display equation and one inline equation, rendered visually.
   Hand-build it with HTML/CSS (stacked `.num`/`.den` fractions with a border-top rule, a large
   `∫` glyph, italic serif variables, raised exponents). Do **not** load a CDN. Label it as KaTeX.
2. **Code block** — header bar with language + filename, and **Copy / Wrap / Download** buttons.
   Copy must actually work (`navigator.clipboard`) and flip the label to "Copied". Syntax colour
   via spans. Horizontal overflow scrolls inside the block only.
3. **Diagram** — a real flowchart drawn in inline `<svg>` (nodes + arrowheads + edge labels),
   captioned as Mermaid, with Copy-source / Export actions. Never ASCII art.
4. **Table** — a proper bordered table, right-aligned numeric column using
   `font-variant-numeric: tabular-nums`.
5. **Message footer** — one row: Copy full message · Retry · Export · Share.

---

## 4. Technical contract — identical in all five files

- **One file. Fully self-contained.** No CDN, no external font, no external image, no build step.
  It must work when double-clicked from disk. Inline `<style>` and `<script>` only.
- **Light and dark, both first-class.** Define the palette as CSS custom properties on `:root`,
  redefine under `@media (prefers-color-scheme: dark)`, and **again** under
  `:root[data-theme="dark"]` and `:root[data-theme="light"]` so an explicit toggle beats the
  media query in both directions. Style components through tokens only — never put component
  rules inside the media query. Persist the choice in `localStorage`. The toggle must be visible
  and switch instantly.
- **Genuinely interactive.** At minimum, all of these must work:
  - Send a message (Enter sends, Shift+Enter newlines) → user bubble appends → a typing
    indicator → a canned assistant reply appends and the transcript scrolls to it.
  - Switch conversations in the sidebar; the transcript swaps. Sidebar collapse/expand.
  - New chat → the empty state.
  - Theme toggle (light / dark / system).
  - Model picker — opens, selects, updates the label, closes on outside-click and Escape.
  - Sovereignty tier picker + the Public guardrail confirm (A6).
  - `/` in the composer opens the slash menu of skills + MCP servers, filters as you type,
    Arrow keys move, Enter/click inserts, Escape closes **and returns focus to the composer**.
  - `⌘K` / `Ctrl+K` command palette — searches conversations, documents and actions.
  - Settings modal (D8) with working category switching.
  - Copy buttons with "Copied" feedback.
  - Collapsible reasoning line (D6).
  - Dismissible first-run tour card that stays dismissed via `localStorage` (D10).
- **Accessibility & hygiene.** Visible `:focus-visible` states, `aria-label` on icon-only
  buttons, `prefers-reduced-motion` respected, real `<button>` elements for controls, Escape
  closes any overlay, no horizontal scroll on `body`.
- **Quality bar.** Close every non-void element, double-quote attributes, watch selector
  specificity so spacing rules don't cancel out. Icons: inline `<svg>` with
  `stroke="currentColor" fill="none"`. No emoji as UI icons.
- **Content is real.** Use the facts in §1. Never lorem ipsum, never `Item 1 / Item 2`.

### Shared design tokens — start from these, then adapt to your app's personality

```css
:root{
  --bg:#FFFFFF; --bg-2:#F7F8FA; --surface:#FFFFFF; --surface-2:#F2F4F7; --surface-3:#E8EBF0;
  --line:rgba(16,22,30,.10); --line-2:rgba(16,22,30,.18);
  --tx:#0F141A; --tx-2:#4C5766; --tx-3:#7B8798;
  --accent:#2563EB; --accent-dim:rgba(37,99,235,.10);
  --private:#15803D; --private-dim:rgba(21,128,61,.10);   /* on-prem  */
  --public:#B45309;  --public-dim:rgba(180,83,9,.10);      /* leaves your network */
  --r:10px; --r-lg:16px;
  --mono:"SFMono-Regular",ui-monospace,"JetBrains Mono",Menlo,monospace;
}
:root[data-theme="dark"], @media (prefers-color-scheme: dark){
  --bg:#0B0E13; --bg-2:#10141B; --surface:#131820; --surface-2:#1A202A; --surface-3:#222935;
  --line:rgba(255,255,255,.08); --line-2:rgba(255,255,255,.14);
  --tx:#E9EEF5; --tx-2:#98A3B6; --tx-3:#6B7788;
  --accent:#5B8DEF; --accent-dim:rgba(91,141,239,.16);
  --private:#3FCF95; --private-dim:rgba(63,207,149,.14);
  --public:#E0A33C;  --public-dim:rgba(224,163,60,.14);
}
```

`--private` / `--public` are **semantic**, not decorative. Never reuse the accent for them, and
never reuse them for anything other than sovereignty state.

**Fonts:** system stacks only (`-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui,
sans-serif` and the mono stack above). A CDN webfont would silently fall back — don't.

**Brand:** the Magna mark is a bowtie/butterfly "M" in red, blue and green. Render it as inline
SVG. It may animate in the backdrop (D11) but must never sit behind body text.

---

## 5. The five apps

Each file has a different **layout and personality**. They are not skins of one layout —
someone flipping between them should immediately see five different products.

### `app-1-chatgpt.html` — "Familiar"
Model the layout on ChatGPT. Narrow dark/light sidebar with New chat, search, and date-grouped
history. Centred transcript column (~48rem), user messages as right-aligned grey bubbles,
assistant messages as full-width plain text with no bubble. Model picker as a quiet dropdown at
the **top-left of the transcript area** (where ChatGPT puts it) — this replaces the global
header. Rounded pill composer with a `+` attach on the left and a circular send on the right.
Empty state: a centred greeting with the composer under it and four **pre-fill** chips (A3).
Personality: neutral, familiar, low-chrome, generous whitespace.

### `app-2-claude.html` — "Considered"
Model the layout on Claude. Warm paper light mode (a cream/oat ground, warm-grey neutrals with
a slight amber bias, a terracotta-adjacent accent is acceptable **here only**) and a soft
charcoal dark mode. Sidebar with Projects above chat history. Serif or high-contrast display
face feel for headings via system stacks. The signature move: a **split artifact panel** — when
an answer produces a document, diagram or code file it opens in a right-hand panel with its own
tab bar (Preview / Code) while the chat narrows on the left. Put the rendered Mermaid diagram
and the code block in that panel. Personality: warm, editorial, calm, roomier line-height.

### `app-3-sovereign.html` — "Provable"
Sovereignty is the primary UI, not a dropdown. A persistent right-hand **residency panel**
showing, for the selected answer: where it ran (node, cluster, city), egress bytes, tools run and
whether they were local, data touched, PII masking, retention, and a signed audit hash. Each
answer in the transcript carries a residency stamp chip. Include the tier picker as expanded
cards that state runs-on / data-leaves / models / trade-off, plus the **guardrail modal** (A6)
that names the exact files at risk before switching to Public, and a small SVG boundary diagram
showing your network vs public cloud *not contacted*. Personality: instrument panel, dense,
tabular, `tabular-nums` everywhere, semantic green/amber doing real work.

### `app-4-launchpad.html` — "Ready"
The home screen is the product. Opens on a launchpad, not a blank box: greeting + live status
row (6 systems connected · 18 skills ready · 2 tasks ran overnight), four intent cards
(Analyse / Automate / Create / Simulate) that **draft an editable brief with fillable slots**
into the composer instead of sending (A3 — make this visibly obvious), a "Pick up where you left
off" row of resume cards (an active thread, a paused task needing input, an overnight scheduler
result), and starter prompts generated from actually-connected systems with a dashed
"Connect Salesforce to unlock 6 more" row. Make the **`/` slash menu (D12)** and the **⌘K
palette** the centrepieces here — both should be rich, filterable and clearly demonstrated.
Personality: dashboard-meets-chat, card-driven, momentum.

### `app-5-twin.html` — "Grounded"
The digital twin is in the room. A right-hand **context rail** listing the 16 twin sources
grouped Structural / Behavioural / Dynamics & Intent, each marked connected / partial / missing,
with a coverage meter ("7 connected · 6 partial · 3 missing") and a "Connect these 2 sources"
CTA. Every answer opens with a **"Grounded in"** chip strip naming which systems fed it — and,
in amber, which relevant source did **not** answer. Include an honest confidence note
("Confidence capped at medium — I could not see the site IoT feed, so progress is inferred from
P6 data that is 6 days old"). Personality: analytical, provenance-first, evidence over polish.

---

## 6. Deliverable

Write your single HTML file to the path you were given. Then reply with:

1. **What you built** — 2–3 sentences on the layout and personality.
2. **Fix-list coverage** — a table mapping every ID in §2 (D1–D12, A1–A8) to the concrete UI
   element or behaviour that fixes it in *your* file. If you genuinely could not fit one, say so
   explicitly rather than claiming it.
3. **Interactions implemented** — the list from §4, each marked working or not.
4. **Anything you'd flag** — trade-offs, or places a real implementation would differ.

Do not write any file other than the one HTML file you were assigned.
