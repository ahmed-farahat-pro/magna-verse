# The five apps — what changed in each

One line per app on what it *is*, then the concrete updates made. Every app carries the shared
fix-list from [BRIEF.md](BRIEF.md) §2 and the round-two asks from
[BRIEF-ADDENDUM.md](BRIEF-ADDENDUM.md); the tables below cover what is **specific to that app**.

Open [index.html](index.html) to browse them all.

---

## Shared across all five

These were applied to every file, so they are listed once.

### From your review document

| Ask | What every app now does |
|---|---|
| Remove the global header | Gone. No app-wide bar. Brand, search, history, theme and account live in the sidebar; per-thread state (title, model, tier) sits in a slim thread bar. |
| Share button on its own line; scroll issues | One anchored action row per message — Copy full message · Retry · Export · Share. Scrolling is contained to the transcript region; `body` does not scroll. |
| Static background, not a photo | Token-driven solid surfaces. No raster anywhere. The optional decoration is the animated Magna mark, clipped to the sidebar or empty state, never behind body copy. |
| Theme switch is slow (reloads an image) | Pure CSS custom properties, applied pre-paint by a head script. Zero image loads, so the switch is instant. Persisted in `localStorage`. |
| Remove the 3D robot | Gone from all five. |
| Step tracker / `FINAL RETURN` is noise | Collapsed to one quiet line — "Thought for 6s · searched 2 documents · ran 1 tool" — expandable. No Langfuse IDs, no `FINAL RETURN`, no `$0.0000`. |
| "Latest Kimi" is not a model name | `Kimi K2 Instruct · 1T MoE`, `DeepSeek V3.1 · 671B MoE`, `Qwen 3 · 235B`, `NVIDIA Nemotron · 120B` — with spec and a one-line "use this when" in the picker. |
| Settings should look like Claude's | Modal, category list left, plain label/description/control rows right. No HSL sliders, no film grain, no vignette, no wallpaper zoom. |
| **Reply formatting is broken** | See the rendering section below — this was the biggest change. |
| Tour appears on every login | Shows once, dismissal persisted, with "Replay tour" in Settings → Help. |
| Animated Magna logo | The real mark, rebuilt as clean vector, drawing itself in via `stroke-dashoffset`. |
| No way to discover MCPs | `/` in the composer opens a filterable menu of 18 skills **and** 4 MCP servers, each with a plain-language description. Arrow keys navigate, Enter inserts, Escape closes and returns focus to the composer. |

### The rendering fixes (R1–R4) — the launch blockers

Your screenshots showed the app shipping raw LaTeX, ASCII-art flowcharts, and code blocks with no
copy button. All five apps now demonstrate the fix in their transcripts:

- **Maths** renders as notation — real integral signs, stacked fractions, raised exponents,
  limits-stacked sigmas — inline and in display blocks. Hand-built in HTML/CSS, no CDN.
- **Diagrams** are real inline `<svg>` — shapes, arrowheads, edge labels, decision diamonds —
  captioned as Mermaid, with copy-source and export. Zero box-drawing characters.
- **Code blocks** carry a language + filename header and working Copy / Wrap / Download.
- **Copy full message** sits in every message's action row.
- **Tables** are bordered, with right-aligned numeric columns using `tabular-nums`.

### The real Magna logo

Your production SVG is 1.1 MB — it embeds a base64 Inter font and two raster images, so it cannot
be inlined into a prototype. I extracted the real geometry and colours from it and rebuilt the mark
as ~700 bytes of clean vector: the green→blue stroke (`#2FB44A` → `#1F8F86` → `#1E50C8`) and the
red stroke (`#DC3232` → `#A3241A`). Reference copy at [assets/magna-mark.svg](assets/magna-mark.svg).

It is inlined in every app (4–13 instances each), with **unique gradient IDs per instance** —
duplicate IDs silently break every copy after the first, which is the classic failure here. It
draws itself in on load, and under `prefers-reduced-motion: reduce` it simply appears fully drawn.

**The mark is now the thinking indicator.** The bouncing dots are gone. When you send a prompt, the
mark loops with progressing status text — and the text says something true rather than "Loading":

| App | Status sequence |
|---|---|
| Familiar | Thinking… → Searching Company Knowledge… → Writing… |
| Considered | Thinking… → Searching Company Knowledge… → Running `p6-schedule`… → Writing… |
| Provable | Routing to Riyadh DC-1… → Running on 8×H200, in tenancy… → Writing… |
| Ready | Thinking… → Searching SAP S/4HANA… → Writing… |
| Grounded | Thinking… → Reading 4 of 16 twin sources… → Writing… |

### Responsive — the live app is not, these are

| Range | Behaviour |
|---|---|
| **≥1024** | Full layout: sidebar plus any right-hand panel as in-flow columns. |
| **768–1023** | Sidebar collapses to an icon rail or overlay drawer. Right-hand panels become toggleable overlays, not squeezed third columns. |
| **<768** | Sidebar is an off-canvas drawer — hamburger, scrim, closes on scrim tap, on Escape and on selecting a conversation, with focus trapped and `aria-expanded` set. Right-hand panels become full-screen sheets. Modals become bottom sheets. Composer sticky, `100dvh` with a `100vh` fallback, `env(safe-area-inset-bottom)`. Tap targets ≥44 px. Card grids collapse to one column. Keyboard hints hidden. |

Checked at 320, 375, 414, 768, 1024 and 1440 px. No horizontal page overflow at any width —
tables, code, diagrams and maths scroll inside their own containers.

---

## `app-1-chatgpt.html` — **Familiar**

The layout everyone in the building already knows, so nobody needs training. Narrow sidebar,
centred transcript, right-aligned user bubbles, full-width assistant text, pill composer.

| Update |
|---|
| Model picker moved to the **top-left of the transcript**, where ChatGPT puts it — this is what replaces the deleted global header. |
| Date-grouped history with full titles in a permanent rail, replacing Chat → History → expand. |
| Empty state is a centred greeting with the composer beneath and four **pre-fill** chips. |
| **The animated mark as the thinking indicator** — your specific ask for demo 1. Send a prompt and the logo appears and animates until the answer lands. |
| Theme switcher as a three-way segmented control in the sidebar footer. |

## `app-2-claude.html` — **Considered**

Warm-paper light mode (oat ground, warm-grey neutrals, terracotta accent) and a soft warm-charcoal
dark mode. Editorial spacing, serif headings. Projects sit above chat history.

| Update |
|---|
| **Split artifact panel** — three artifacts (a Markdown brief, a Mermaid flowchart, a Python monitor) open in a right-hand panel with a chip switcher and Preview/Code tabs, while the chat narrows from 47rem to 40rem. |
| On tablet the panel becomes an overlay; on mobile a full-screen sheet with a 44 px close. |
| Projects with chat and file counts above date-grouped history. |
| Web citations framed as locally-mirrored copies ("indexed 12 Aug 2026, the live site was not contacted") so they don't contradict the Private tier's zero-egress claim. |
| Two bugs found and fixed in verification: a collapsed sidebar stuck at 274 px (`min-width:auto` on a flex item clamping to min-content), and duplicated sidebar-toggle logic. |

## `app-3-sovereign.html` — **Provable**

Sovereignty as the primary UI, not a dropdown. Instrument-panel density; `tabular-nums` on every
figure; semantic green and amber carrying real meaning.

| Update |
|---|
| **Persistent residency panel.** Click any answer — its stamp chip, its receipt link, its body, or its row in the thread ledger — and the panel loads *that turn's* receipt: node, cluster, city with coordinates and data-residency zone, egress bytes, tools run with local/external tags, data touched with classification, PII masking, retention, tokens, GPU-seconds, and a signed audit hash. |
| **Guardrail modal** naming the exact at-risk items before switching to Public — file name, where it entered the thread, and its classification. Switching writes a notice into the transcript and flips the thread bar, composer line, boundary diagram and ledger. |
| Inline **SVG boundary diagram** that redraws for sealed / proxied / public egress, showing public cloud visibly *not contacted*. |
| Tier cards state runs-on / data-leaves / models / trade-off. Personal and In-Country shown as **dated roadmap** (Q4 2026), not dead greyed-out menu items. |
| Roadmap items moved out of primary nav into Settings → Help. |
| Two bugs fixed in verification: sub/superscripts being blockified by a flex container, and the document click handler throwing on synthetic events with a non-Element target. |

## `app-4-launchpad.html` — **Ready**

The home screen is the product. Opens on a launchpad, not a blank box.

| Update |
|---|
| **Intent cards that draft, not fire.** Each card says "Drafts a brief · never sends" on its face, and fills the composer with an editable brief containing fillable slots. This was the most surprising behaviour in the live app — clicking *Analyze* silently sent a 30-word question the user never wrote. |
| Live status row: Private · Riyadh DC-1 · 8×H200 · 6 systems connected · 18 skills ready · 2 tasks ran overnight. |
| "Pick up where you left off" — an active thread, a task paused on a missing SAP export, and an overnight scheduler result, each with its own resume action. |
| Starters generated from actually-connected systems, plus a dashed "Connect Salesforce to unlock 6 more" row that doubles as a sales hook. |
| The `/` slash menu and ⌘K palette are the centrepieces here — both filterable, arrow-key navigable, and full-width sheets on mobile rather than popovers positioned off-screen. |
| The animated Magna mark as the launchpad backdrop. |

## `app-5-twin.html` — **Grounded**

Provenance first. The digital twin is in the room instead of behind a 12 px unlabelled tab.

| Update |
|---|
| **Context rail** with all 16 twin sources grouped Structural / Behavioural / Dynamics & Intent, each marked connected / partial / missing, above a live coverage meter reading "7 connected · 6 partial · 3 missing". |
| Toggling any source **updates the meter live**. "Connect these 2 sources" flips them, updates coverage, and raises the stated confidence. |
| Every answer opens with a **"Grounded in"** chip strip naming which systems fed it — with any relevant-but-missing source shown in amber. |
| Honest confidence note: "Confidence capped at medium — I could not see the site IoT feed, so progress is inferred from P6 data that is 6 days old." Every gap becomes a concrete Connect CTA. |
| "This answer used 4 of 16 sources" stated on the answer itself. |

---

## Known limitations

Stated plainly rather than left to be discovered:

- **I never saw the live app myself.** Both browser surfaces failed for most of this session, so
  the audit rests on your Chrome-extension walkthrough and your screenshots. Worth one pass against
  the real build before this goes to anyone at Magna.
- **All figures are fabricated but internally consistent** — the vendor tables sum to 100%, the
  quoted shares match the inline maths, the HHI matches the stated shares. The point of the
  prototype is that the *shape* of the answer survives rendering.
- **Audit hashes and receipt IDs are generated client-side.** In production they come from the
  platform's signing service; the panel is a view over that record, not its producer.
- **Inline citation markers stay 24×24 on touch.** Making an inline superscript a 44 px target
  destroys the line box. This is the one deliberate exception to the tap-target rule.
- **Retry and Share are toasts**, not full flows. Copy, Export and Download do real work
  (`navigator.clipboard` with an `execCommand` fallback for `file://`, and Blob downloads).
- **The LaTeX delimiters need fixing server-side too.** Your screenshot shows `$\int x^3 , dx$` —
  a bare `,` where `\,` was intended. A renderer alone will not fix that; the prompt template
  needs correcting as well.
