# MagnaVERSE — UX Audit & Redesign Concepts

**App:** `app.stag.magna.ai` · version 1.0.491
**Method:** hands-on walkthrough — every navigation flyout opened, every header control clicked, three real conversations sent and read, model/sovereignty/tools/knowledge/trace panels exercised.
**Date:** 16 Aug 2026

---

## 1. Feature map — what actually exists and what each control does

### Header (top bar)

| Control | What it actually does | Verdict |
|---|---|---|
| Magna logo | Go to home | fine |
| 🔍 magnifier | **Command palette.** Searches conversations + jumps to Tasks, Projects, Skills, Apps, Tools & MCPs, Channels, Schedules, Heartbeat, Knowledge, "Take the tour" | Best feature in the app. No label, no ⌘K hint |
| Sovereignty ▾ | Picks the inference tier: **Personal** *(coming soon)*, **Private** *(active)*, **In-Country** *(coming soon)*, **Public** | 2 of 4 options are dead |
| 🏛 bank icon | **Usage** dashboard — monthly budget ($5,000), requests, tokens, spend, per-model breakdown, Requests log | Icon reads as "government", not "usage" |
| 🔔 bell | Notifications **+ Companion picker** — swaps the 3D robot for Fox, Wolf, Husky, Shiba Inu, Alpaca, Horse, Cow, Bull, Deer, Stag; "Hide companion" | Two unrelated features in one popover |
| ⓘ info | **Take the tour** — a 7-step onboarding modal. Its own copy calls it "this Compass button" | Label/icon mismatch |
| ⚙ gear | **Account menu** — Focus mode, Profile, Devices, Language, Settings, Theme & Display, Logout | Account hidden behind a gear, and "Settings" nested inside the settings icon |

### Left navigation (7 sections, hover/click flyouts)

| Section | Items | Working |
|---|---|---|
| **Chat** | New Chat · Projects · History (collapsible list) | 3 / 3 |
| **Tasks** | Tasks · Heartbeat · Schedulers | 3 / 3 |
| **Workspace** | Artifacts · ~~Document~~ · ~~Image~~ · ~~Code~~ | 1 / 4 |
| **Apps** | All Apps · ~~Magna~~ · ~~Company~~ · ~~User~~ · ~~Default~~ | 1 / 5 |
| **Governance** | Security · ~~PII Detection~~ · ~~Guardrails~~ · ~~Access Control~~ · ~~Benchmarks~~ · ~~Sovereignty~~ | 1 / 6 |
| **Connections** | Channels · Skills · Tools & MCPs · Knowledge | 4 / 4 |
| **Upcoming** | ~~Code~~ · ~~Simulations~~ · ~~Agentic Twins~~ · ~~Use Cases~~ · ~~Marketplace~~ | **0 / 5** |

**26 destinations, 13 disabled.**

### Composer

| Control | What it does |
|---|---|
| 📎 | Attach file |
| ⚙-sliders | **Tools** → `{} MCP` · `Skills 18/18` · `Agents`. Skills opens a checkbox list of 18 skills with truncated descriptions |
| 📊 | **Knowledge base** — tooltip: "Search your documents before answering". A toggle, on by default |
| 🔗 | Share |
| Model ▾ | Latest DeepSeek · **Latest Kimi** ★ · Latest Qwen · Nvidia Nemotron-120B — all labelled "private" |
| ➤ | Send |
| 🕐 (top-right of composer) | **Show traces** — Langfuse observability: session id, per-turn duration, cost, observation count |
| `Private` pill | Duplicate of the header sovereignty state |

### Answer surface

- Step tracker: `Planning → Searching → Generating → Done`, with a table of `model`, `read_file`, `execute_skill_script`, `FINAL RETURN`, timings.
- Message actions: 3 unlabelled icons — Share, **Recalled memory** (shows `MEDIUM · explicit · 0.18` and the raw key `memories:context/interest-learning-coding`), and a book icon.
- Right screen edge: a 12px vertical tab reading **"ACTIVE AT TrendIQ"**. Opens the **Agentic Twin topology** — 16 context sources across Structural (3/5), Behavioral (1/4), Dynamics (1/3), Intent (2), "7/16 connected · 6 partial", Sovereign Mode.

### Appearance (gear → Theme & Display → Display Settings)

Interface scale · Dark/Light/~~Rainbow~~ · Background overlay % · 7 background animations · wallpaper picker · vignette · film grain · background blur · wallpaper zoom · 8 accent colours · raw **Hue / Saturation / Lightness** sliders showing `hsl(210, 67%, 47%)`.

**Answer quality itself is good.** The construction-risk answer was specific, sourced and well structured; memory across turns worked. The problems below are all in the shell around it.

---

## 2. UX issues, by severity

### 🔴 Critical — these cost users trust or time on every session

**C1 · The mascot blocks the send button.**
The 3D robot sits on top of the composer's model selector and send control. My first click intended for the model picker opened the companion/notifications panel instead. Fixable in one line, but it is the first thing a demo audience will notice.

**C2 · Prompt chips fire without consent.**
Clicking **Analyze** does not enter a mode — it silently sends *"What can you help me analyze? Walk me through your data, document, and pattern analysis capabilities…"*, a 30-word question the user never wrote, and burns 12 seconds. Same pattern for Automate / Create / Simulate. This is the single most surprising behaviour in the product.

**C3 · Body text sits on a photograph.**
Default theme is a Riyadh skyline wallpaper at 50% overlay, and answers render directly over it. Contrast fails in the lower third of the viewport. There are eight sliders to tune the wallpaper and no "plain background" default.

**C4 · Developer tooling is shipping to end users.**
Langfuse session IDs and `$0.0000` cost, `FINAL RETURN`, *"Final step completed without captured I/O."*, raw memory keys with relevance scores, a skill listed as `elon-musk-perspective-en (failed to parse SKILL…)`, and `salesforce-uat-api` pointing at a `.sandbox.my.salesforce.com` URL. A staging artefact leak, but the trace panel is a deliberate product surface and shouldn't be.

**C5 · Half the navigation is a promise.**
13 of 26 destinations are greyed out. The section that is visually boxed and highlighted on load — **Upcoming** — contains five items, all dead. First impression: a product that mostly doesn't work, when in fact the working parts are strong.

### 🟠 High — these cap how good the product can feel

**H1 · Conversation history is buried three levels deep.**
Chat → History → expand → a ~150px scroll box with titles cut to ~18 characters ("What are the to…"). ChatGPT and Claude both give history a permanent rail. This is the #1 structural gap.

**H2 · No copy button. No regenerate. No edit.**
Three unlabelled icons with no tooltips. Copy is the most-used action in every chat product on earth.

**H3 · The reasoning trace is expanded by default on every message.**
~200px of `model / read_file / execute_skill_script` above every answer, pushing the answer below the fold. I had to scroll to read every response.

**H4 · Answers cite sources in prose but link nothing.**
The answer named *Scientific Reports* and *HKA CRUX 2025* with figures — no links, no distinction between web and internal knowledge. For a sovereign deployment, "did this come from our data or the internet?" is the question that matters most.

**H5 · The Agentic Twin is invisible.**
The richest enterprise capability — a 16-source context graph with connection coverage — lives behind a 12px unlabelled tab with vertical text on the screen edge. "AT" is never expanded anywhere in the UI.

**H6 · Sovereignty is under-sold and under-protected.**
The differentiator renders as a dropdown with one-line abstractions. Nothing warns you when moving a thread containing internal documents to Public. Nothing tells you, per answer, where it ran.

**H7 · Focus is silently dropped.**
After closing the command palette, I clicked the composer and typed a full sentence — the keystrokes went nowhere. Had to click again. Reproducible.

### 🟡 Medium — friction and polish

- **M1** — The page titled **Tasks** is subtitled *"Custom roles for delegation"* and its primary button says **+ New agent**. Three different nouns for one thing.
- **M2** — **Workspace** and **Apps** use an identical cube icon.
- **M3** — Empty states say only *"Nothing here yet"* — no example, no explanation of what a task or agent is.
- **M4** — The 18-skill checkbox list exposes internal names (`heartbeat`, `magna-api-skill-generator`, `jira-ticket-definer`) with truncated descriptions, and every skill is on by default. Users are being asked to make a decision they cannot evaluate.
- **M5** — Model names are bare (`Latest Kimi`, `Nvidia Nemotron-120B`) with no guidance on which to pick for what.
- **M6** — The knowledge-base toggle stays on for conversational turns; asking *"what did I just ask you?"* triggered a 3.3s knowledge-base search that returned nothing.
- **M7** — Opening a nav flyout shoves the entire chat column sideways.
- **M8** — Sovereignty state is shown twice (header pill + composer pill).
- **M9** — Onboarding tour is 7 steps and calls the ⓘ icon "this Compass button".
- **M10** — Cost figures ($0.0000, $5,000 budget) are visible to every seat.
- **M11** — Answers reference `/home/project` and "your connected desktop" — generic-assistant framing that doesn't match an enterprise operational brain.

---

## 2b. Round two — the client review

*Added 16 Aug 2026 from Magna's own annotated screenshots.*

The first pass audited the **shell**. The client's review found something the walkthrough
missed entirely, because the test questions were prose questions: **the answer renderer is
broken for every non-prose content type.** This is a more serious class of defect than
anything in §2, because it makes whole categories of user — engineering, finance, data,
anyone who asks a maths or coding question — unable to use the product at all.

### 🔴 Rendering — the answer surface cannot display its own output

**R1 · LaTeX is never parsed.**
Asking for integral calculus practice returns ~25 consecutive lines of literal source:
`$\int x^3 , dx$`, `$\int \frac{1}{x^2} , dx$`, `$\int \frac{x}{\sqrt{x^2 + 4}} , dx$`.
The model is emitting correct LaTeX; the client has **no math renderer**. Secondary bug: the
delimiters are malformed — a bare `,` where `\,` was intended — so even a renderer would need
the prompt template fixed too. **Any technical seat is unusable until this ships.**

**R2 · Diagrams degrade to ASCII art.**
Asked how Apple Pay works, the model announced *"I'll sketch both a visual flowchart and a text
version"* — then drew both in box-drawing characters (`┌───┐`, `│`, `▼`). There is no Mermaid or
SVG renderer, so the "visual" version is the same as the text version. It also reflows into
garbage at any other window width.

**R3 · Code blocks have no affordances.**
A bare dark rectangle. No language label, no filename, no wrap toggle, no line numbers, and
**no copy button** — the most-pressed control in every chat product on earth. Prose and inline
code run together underneath with no vertical rhythm.

**R4 · No "copy full message".**
Nothing on the answer copies the whole response. Combined with R3, getting an answer out of
MagnaVERSE and into a document means manual selection across a scrolling region.

### 🟠 Shell & chrome — the client's specific asks

| # | Finding | Ask |
|---|---|---|
| **S1** | A global top header (logo · search · sovereignty · bank · bell · info · gear) spans the app | Remove it. ChatGPT and Claude have no app-wide header; everything belongs in the sidebar or in-context. |
| **S2** | The Share button renders on its own line below the message; the footer fights the scroll container | One anchored action row per message. Fix the transcript's scroll containment. |
| **S3** | Body text renders over a Riyadh skyline photo at 50% overlay | Static solid background. A Saudi-green shaded variant is welcome as a *theme*, not as a photo. |
| **S4** | Light/dark switching reloads the wallpaper image and visibly stalls | Token-only theme switch, instant. If decoration is wanted, animate SVG/CSS — never a raster. |
| **S5** | A 3D robot companion floats over the composer, covering the send button | Remove it. |
| **S6** | Model menu reads `Latest Kimi`, `Latest Qwen`, `Latest DeepSeek` | Show full model identity — `Kimi K2 Instruct · 1T MoE`. Buyers evaluating a sovereign stack need weights, version and size. |
| **S7** | Settings is a sprawling panel ending in raw `hsl(210, 67%, 47%)` sliders and film grain | Rebuild in the Claude/ChatGPT idiom: modal, category list left, plain rows right. "It does not need to look fascinating — it needs to be understood." |
| **S8** | The onboarding tour runs on **every** login | Once. Then a "Replay tour" entry in Help. |
| **S9** | The step tracker (`Planning › Searching › Generating › Done`, `FINAL RETURN`, *"Final step completed without captured I/O."*) sits expanded above every answer | Collapse to one quiet line, expandable. Langfuse internals are not an end-user surface. |
| **S10** | No discoverable way to use MCP servers | Typing `/` opens a filterable menu of skills **and** MCP servers with plain-language descriptions. |
| **S11** | Client request | Use the Magna mark (red / blue / green) as a subtle **animated SVG** backdrop — behind the sidebar and empty state, never behind body copy. |

**Net:** R1–R4 are launch-blocking and were invisible to a prose-only walkthrough. S1–S11 are
the shell asks, and every one of them is cheap relative to its impact.

---

## 3. Concept boards — the argument

Annotated before/after boards, one per idea. These are the *why*; §4 is the *what*.

| # | Concept | Fixes | One-line thesis |
|---|---|---|---|
| **1** | **The Calm Thread** | H1 · H2 · H3 · H4 · C3 · C1 | Rebuild the screen people spend 95% of their time on: permanent history rail, collapsed reasoning, real citations split web-vs-internal, labelled message actions, a flat readable surface. |
| **2** | **Sovereignty You Can See** | H6 · C5 · S6 | Turn the reason-to-buy into a visible guarantee: tiers that explain themselves, a pre-flight guardrail that names the exact files at risk, a per-answer residency receipt (node, egress bytes, PII masking, retention, signed hash), and a diagram of the boundary. |
| **3** | **The Launchpad** | C2 · M3 · M5 · S10 | Replace the marketing hero with the first useful minute: status not slogan, chips that *draft an editable brief instead of firing*, resume cards for paused threads and overnight tasks, starters generated from what you've actually connected, and a promoted ⌘K palette. |
| **4** | **Bring the Twin Into the Room** | H5 · H4 | Promote the hidden AT/TrendIQ graph to a context rail: "7 connected · 6 partial · 3 missing", per-answer grounding chips, an honest "confidence capped — I couldn't see X", and every gap as a concrete Connect CTA. |
| **5** | **Two Doors** | C4 · C5 · M1 · M2 · S7 | One product, three audiences. **Work** (chat, projects, tasks, files) for 95% of seats; **Build** (skills, agents, MCPs) opt-in; **Govern** (residency, guardrails, usage, traces, audit) as a separate admin console. 6 nav items instead of 26. |
| **6** | **Answers That Render** | **R1 · R2 · R3 · R4** · S2 · S6 | *Added in round two.* Side-by-side proof: today's raw `$\int$` source, ASCII flowchart and bare code rectangle against a rendered equation, an SVG flowchart, a framed code block with copy, a real table, and one anchored action row. |

Boards: `concepts/01corechat` · `02sovereignty` · `03launchpad` · `04contextrail` ·
`05twomodes` · `06richanswers` — self-contained, editable HTML.

---

## 4. The five app designs — the build

Five complete, interactive, single-file prototypes. Each has light **and** dark mode, working
keyboard and mouse interaction, and every fix from §2, §2b built in. They are five different
products, not five skins: the point is to choose a direction, not a colour.

| File | Name | Personality | Signature move |
|---|---|---|---|
| `apps/app-1-chatgpt.html` | **Familiar** | Neutral, low-chrome, generous whitespace — the ChatGPT idiom | Zero learning curve. Model picker at the top-left of the transcript replaces the global header. |
| `apps/app-2-claude.html` | **Considered** | Warm paper light mode, soft charcoal dark, editorial rhythm — the Claude idiom | Split **artifact panel**: documents, diagrams and code open beside the chat with Preview/Code tabs. |
| `apps/app-3-sovereign.html` | **Provable** | Instrument panel — dense, tabular, semantic green/amber doing real work | Click any answer → its **residency receipt** (node, egress bytes, PII masking, signed hash) loads in the right panel. |
| `apps/app-4-launchpad.html` | **Ready** | Dashboard-meets-chat, card-driven | The home screen *is* the product; the `/` menu and ⌘K palette are the centrepieces. |
| `apps/app-5-twin.html` | **Grounded** | Analytical, provenance-first | The **context rail**: 16 twin sources, live coverage meter, per-answer grounding chips, honest confidence. |

Shared build contract: `BRIEF.md`.

---

## 5. Suggested sequencing

**Now — launch blockers**
Ship a math renderer (R1) · a diagram renderer (R2) · code-block chrome with copy (R3) ·
copy-full-message (R4). Fix the LaTeX delimiters in the prompt template while you are in there.

**Week 1 — free wins, no design debate**
Remove the companion (S5) · make prompt chips pre-fill instead of send (C2) · collapse the trace
panel (S9) · fix composer focus after ⌘K (H7) · full model names (S6) · tour once (S8) · remove
the `Upcoming` section and the broken/UAT skills from production (C5).

**Weeks 2–4 — the shell**
Delete the global header (S1) · permanent conversation sidebar (H1) · static background, theme
switch without an image load (S3, S4) · one anchored message action row (S2) · settings rebuilt
in the Claude idiom (S7) · citations split web/internal (H4) · `/` menu for skills and MCPs (S10).

**Quarter — the differentiators**
Sovereignty guardrail + residency receipt (Concept 2) · context rail (Concept 4) ·
Work/Build/Govern split (Concept 5) · animated Magna-mark backdrop (S11).
