# MagnaVERSE — Full Functional & UX Redesign Spec

**Target:** `app.stag.magna.ai` · build `1.0.491`
**Method:** every reachable route opened, every flyout expanded, every tab clicked, agent/schedule/channel creation flows walked field-by-field, live conversations sent.
**Audit date:** 16 Aug 2026
**Purpose:** a single source of truth for a full redesign — what each capability *is*, what it *does today*, what's *wrong with it*, what it *should become*, and a **copy-paste build prompt** for each.

---

## How to read this document

Every capability gets the same six blocks:

| Block | Meaning |
|---|---|
| **What it is** | The capability in one sentence |
| **Where it lives** | Exact route + how a user reaches it |
| **What it does today** | Verified behaviour, field by field |
| **What's good** | Keep this |
| **UX problems** | Severity-tagged: 🔴 critical · 🟠 high · 🟡 medium |
| **Redesign** | The target experience |
| **🛠 Build prompt** | Paste into v0 / Cursor / Claude Code / Figma Make to generate it |

---

## 0 · System map

### Routes that exist

| Route | Page | Reachable from | State |
|---|---|---|---|
| `/` | Chat + hero | default | ✅ live |
| `/skill` | Skills | Connections › Skills | ✅ live |
| `/tool-mcp` | Tools & MCPs | Connections › Tools & MCPs | ✅ live |
| `/channel` | Channels | Connections › Channels | ✅ live |
| `/rag` | Knowledge | Connections › Knowledge | ✅ live |
| `/agent` | Agents ("Tasks") | Tasks › Tasks | ✅ live |
| `/heartbeat` | Heartbeat | Tasks › Heartbeat | ✅ live |
| `/schedule` | Schedules | Tasks › Schedulers | ✅ live |
| `/artifacts` | Artifacts | Workspace › Artifacts | ✅ live |
| `/apps` | Apps | Apps › All Apps | ⚠️ one demo card |
| `/security` | Security | Governance › Security | ✅ live |
| `/usage` | Usage & budget | 🏛 header icon | ✅ live |
| `/usage?panel=settings` | Settings panel | ⚙ › Settings | ✅ live |
| `/profile` | Profile & Personality | ⚙ › Profile | ✅ live |
| `/projects` | Projects | Chat › Projects | ✅ live |

**Route naming is inconsistent:** singular (`/skill`, `/channel`, `/agent`, `/schedule`) vs plural (`/apps`, `/artifacts`, `/projects`), plus `/rag` and `/tool-mcp` which are implementation names, not product names. `/project`, `/artifact`, `/app`, `/knowledge` all 404.

### The 404 page

🔴 **A white, unstyled `404 / This page does not exist. / Home` page** on a black product. Looks like a different application. Any mistyped URL or stale link dumps the user out of the design system entirely.

### The nav tally

26 destinations across 7 sections. **13 do nothing.** The section highlighted by default on load — *Upcoming* — is 5 items, all disabled.

---

## 1 · Chat & Composer

### What it is
The primary surface. A streaming chat with tool use, planning traces, memory recall, and per-message actions.

### Where it lives
`/` — always the landing screen.

### What it does today

**The composer bar (left to right):**

| Control | Behaviour |
|---|---|
| 📎 Attach | File upload into the turn |
| Sliders icon | Opens **Tools** menu → `{} MCP` · `Skills 18/18` · `Agents` |
| Chart icon | **Knowledge base** toggle. Tooltip: *"Search your documents before answering."* On by default |
| Share icon | Share conversation |
| Model ▾ | `Latest DeepSeek` · **`Latest Kimi`** ★ · `Latest Qwen` · `Nvidia Nemotron-120B` — all labelled `private` |
| ➤ Send | Submit |
| 🕐 (top-right of composer) | **Show traces** — Langfuse panel: `session_id: thr_ltXzvv2eMiNcLOL4`, per-turn duration, `$0.0000`, `25 obs` |
| `Private` pill | Duplicate of the header sovereignty state |

**The answer surface:**
- Step tracker `Planning → Searching → Generating → Done`, expanded by default, listing `model`, `read_file`, `execute_skill_script`, `FINAL RETURN`, and the string *"Final step completed without captured I/O."*
- Message actions: **three unlabelled icons** — Share, *Recalled memory*, and a book icon. No tooltips.
- Recalled memory panel shows `MEDIUM · explicit · 0.18` and the raw key `memories:context/interest-learning-coding`.

**The empty state:** full-bleed Riyadh skyline photo, `MagnaVERSE` wordmark, tagline *"Your enterprise operational brain — perceive, reason, and act with agentic intelligence."*, and four chips: **Analyze · Automate · Create · Simulate**.

### What's good
Answer quality is strong — specific, well-structured, and it correctly recalled prior turns. The Planning/Searching/Generating tracker is a genuinely good idea, badly presented.

### UX problems

🔴 **The 3D robot companion overlaps the model selector and send button.** A click aimed at the model picker opens the companion panel instead. The companion is configurable (Fox, Wolf, Husky, Shiba Inu, Alpaca, Horse, White Horse, Cow, Bull, Deer, Stag) via the 🔔 bell, and hideable — but it ships on, over the primary action.

🔴 **The four chips fire a prompt the user never wrote.** Clicking *Analyze* silently sends *"What can you help me analyze? Walk me through your data, document, and pattern analysis capabilities, and give a few concrete examples of what I could ask you to do."* — then burns 12 seconds. No preview, no edit, no undo.

🔴 **Body text renders over a photograph** at a 50% overlay by default.

🟠 **The trace panel is expanded on every message**, consuming ~200px above every answer and pushing it below the fold.

🟠 **No copy button.** No regenerate. No edit-and-resend.

🟠 **No citations.** The answer named *Scientific Reports* and *HKA CRUX 2025* with hard figures and linked nothing — and drew no line between web sources and internal knowledge base.

🟠 **Knowledge-base toggle stays on for conversational turns.** Asking *"what did I just ask you?"* triggered a 3.3s knowledge-base search that returned nothing.

🟡 The composer shows five icon-only buttons with no labels. `Private` appears twice on screen.

### Redesign

- Companion: **off by default**, moved to a corner that never overlaps a control, opt-in from Appearance.
- Chips become **intent scaffolds**: clicking *Analyse* fills the composer with an editable brief containing slots (`Analyse ⟨this file ⌄⟩ and tell me ⟨what changed vs last quarter ⌄⟩`). Cursor lands in the first slot. Nothing sends until ↵.
- Trace collapses to a single chip: `Reasoned for 10s · searched web · read 2 docs · Show steps ⌄`.
- Full action row, labelled: **Copy · Retry · Edit · Save to workspace · Export · Share · 👍 👎**.
- Inline numbered citations, plus a Sources block that visually separates **web** from **internal**.
- Knowledge base becomes `Auto` (searches only when the question looks like it needs company data), with `Always` / `Never` overrides.
- Flat readable surface; wallpaper opt-in.

### 🛠 Build prompt

```
Build a dark-theme enterprise AI chat screen for an on-prem LLM platform.

LAYOUT
- 250px persistent left sidebar: logo, primary "New chat" button, search field
  with ⌘K badge, Projects, Tasks & schedules, then conversation history grouped
  by Today / Yesterday / Last week. Each conversation row shows a full untruncated
  title and a 5px status dot indicating which data-residency tier it ran in
  (green = private, amber = public). User chip pinned to the bottom.
- Main column, max-width 660px, centred.
- 48px top bar: conversation title, then three pills — residency
  ("Private · Riyadh DC-1", green), model ("Kimi K2 · Auto"), context ("6 systems").

MESSAGE THREAD
- User messages: right-aligned rounded bubble on a subtle raised surface.
- Assistant messages: full width, no bubble, on a FLAT background — never over
  a photo or gradient.
- Above each assistant answer, one collapsed pill:
  "⎇ Reasoned for 10s | searched web · read 2 docs | Show steps ⌄"
- Inline citations as small numbered chips [1] [2] with a blue tint.
- Below the answer, a "Sources" card: header row "SOURCES ... 2 web · 1 internal",
  then rows each with an index chip, a title, and a right-aligned tag pill that is
  grey for "web" and green for "internal".
- Action row beneath: Copy (default emphasised), Retry, Save, Export, Share,
  then right-aligned thumbs up / thumbs down. All with visible text labels.

COMPOSER (fixed bottom, 15px radius, elevated with a large soft shadow)
- Placeholder "Reply, or ask something new…"
- A row of LABELLED chips: Attach · Company knowledge (active/blue state) ·
  Tools (with a count) · Model name + "Auto" · Private.
- Circular blue send button on the right.
- A centred hint line under the composer: "↵ send · ⇧↵ new line · ⌘K search
  everything · / run a skill" using small keycap-styled tags.

STYLE
Background #080A0F, surfaces #12161F / #171C27, hairline borders
rgba(255,255,255,.075), text #EAEEF5 / #98A3B6 / #606B80, accent blue #3B82F6,
success green #22C55E, warning amber #F5A524. Inter-style sans; monospace only
for IDs and metadata. 10–16px radii. No emoji. Self-contained HTML + CSS.
```

---

## 2 · Conversations, History & Projects

### What it is
Thread persistence and grouping.

### Where it lives
History: `Chat` (hover) → `History` → expand.
Projects: `Chat` → `Projects` → `/projects`.

### What it does today

**History** is a collapsible list nested inside a hover flyout. It renders in a ~150px-tall scroll box. Titles truncate to about 18 characters — a real entry read `What are the to…`. Entries are grouped by month (`AUGUST 2026`) with relative timestamps.

**Projects** (`/projects`): two-pane. Left = project list + `New project`. Right = editor with **Name**, **Colour** (8 swatches), **Description**, and a **Conversations (0)** list. Clicking `New project` immediately creates `Untitled project`. `Delete project` at the bottom right.

### What's good
Project colour-coding and the two-pane layout are clean. Conversations do get auto-titled from the first message.

### UX problems

🟠 **History is three levels deep** (hover Chat → click History → expand) in a box too small to be useful, with titles cut mid-word. This is the single biggest structural gap versus ChatGPT and Claude.

🟠 **Projects have no knowledge and no instructions.** ChatGPT and Claude both let a project carry its own files and custom instructions. Here a project is only a folder of chats — so there's no reason to make one.

🟡 Empty threads are all titled `New Conversation`; the palette showed two identical entries.

🟡 No pin, no archive, no rename-from-list, no bulk select, no search within a thread.

🟡 `New project` creates the record before you've named it, leaving `Untitled project` litter if you back out.

### Redesign

- History becomes the permanent left rail (see §1).
- **Projects gain three tabs: Conversations · Files · Instructions.** Files attached to a project are auto-scoped into every chat inside it. Instructions prepend to the system prompt for that project only.
- Project-level residency: pin a project to `Private` so no thread inside it can be switched to `Public`.
- Row affordances: pin, rename, archive, move to project, export.

### 🛠 Build prompt

```
Design a "Projects" workspace page for an enterprise AI assistant, dark theme.

Two-pane layout.
LEFT (300px): "New project" button, then a list of project rows. Each row =
colour dot, project name, conversation count, and a small lock pill when the
project is residency-pinned.

RIGHT: project detail with an editable title, colour swatch row, and a
description field, then THREE TABS:
  1. Conversations — list of threads with title, last-active time, residency dot
  2. Files — drag-and-drop zone plus a table (File / Size / Indexed / Added).
     Explain in one line: "Files here are searchable from every chat in this
     project." Show an indexing progress state.
  3. Instructions — a plain-language textarea, NOT a raw markdown editor.
     Label it "How should Magna behave in this project?" with 3 example chips
     the user can insert (tone, output format, must-always-cite).

Add a "Data residency" card in the right pane: a segmented control
Private / Public, with a green lock state and the sentence "Every conversation
in this project is forced to Private. Members cannot switch it."

Include a realistic empty state for each tab that explains the value in one
sentence and offers one action — never just "Nothing here yet".

Style: background #080A0F, cards #12161F, borders rgba(255,255,255,.075),
text #EAEEF5/#98A3B6, accent #3B82F6, success #22C55E. Self-contained HTML+CSS.
```

---

## 3 · Models & Sovereignty

### What it is
The product's reason to exist: choosing which inference substrate answers you.

### Where it lives
Header `Sovereignty ▾` · composer `Model ▾` · `Settings → Model defaults`.

### What it does today

**Sovereignty tiers:**

| Tier | Copy | State |
|---|---|---|
| Personal | "Data remains local to the user's device." | *Coming soon* |
| **Private** | "Data remains inside your organization's controlled environment." | **active** |
| In-Country | "Data remains within national sovereign boundaries." | *Coming soon* |
| Public | "Data is handled through global public cloud infrastructure." | selectable |

**Models:** `Latest DeepSeek`, `Latest Kimi` (starred default), `Latest Qwen`, `Nvidia Nemotron-120B`.

**Settings → Model defaults** has a `Public` / `Private` segmented control and five slots:

| Slot | Value |
|---|---|
| Chat model | Nvidia Nemotron-120B |
| Image model | gpt-image-1.5 |
| Vision model | *No models available* |
| Text-to-speech | `azure/tts` |
| Speech-to-text | `azure/whisper` |

### 🔴 The finding that matters most

**Usage → By model** reports the actual routing:

```
azure/Kimi-K2.6                        333.9k tokens
bedrock/nvidia.nemotron-super-3-120b    24.5k tokens
azure/text-embedding-3-small              176 tokens
azure/text-embedding-3-large                7 tokens
tts                                         0 tokens
```

Every request in this environment ran through **Azure** and **AWS Bedrock** while the UI displayed a green **Private** badge and the sentence *"Data remains inside your organization's controlled environment."*

This may be entirely expected for a staging deployment. But **the UI makes a residency claim it does not substantiate**, and it does so in the one place a security reviewer will look. Either the badge must reflect the real substrate per environment, or staging must visibly label itself. Nothing else in this document is as commercially dangerous as this.

### Other UX problems

🟠 **Two of four tiers are dead menu items.** Roadmap in a control surface.

🟠 **Nothing prevents a leak.** You can switch a thread containing SAP data and uploaded files from Private to Public with one click and no warning.

🟠 **No per-answer provenance.** A global header pill tells you nothing about which model, node, or region handled a specific answer.

🟡 Model names carry no guidance — nothing indicates which is best for long documents, code, Arabic, or speed.

🟡 `Vision model: No models available` is shown as a live dropdown rather than a disabled state with an explanation.

### Redesign

- Only real tiers in the picker. Each states: **where it runs · what leaves · which models · what you can use · what you give up.** Roadmap tiers move to a dashed footnote.
- **Pre-flight guardrail**: switching to Public with restricted content in the thread names the exact files and PII at risk and offers "Keep Private" / "Start a clean Public thread".
- **Residency receipt** per answer: inference node, egress bytes, tools run and where, PII masking, retention, exportable signed hash.
- Models get one-line role labels: *Fast everyday*, *Long documents*, *Deep reasoning*, *Arabic-first*, plus an `Auto` default that picks.

### 🛠 Build prompt

```
Design a data-residency control system for an on-premise enterprise AI product.
Dark theme. Produce three components on one page.

1. RESIDENCY PICKER (452px card)
Title "Where should this run?" and subtitle "This decides which GPUs answer you
and where your data is allowed to travel."
Two selectable tier cards, each a radio row plus a definition list:
  PRIVATE (selected, green border + faint green gradient, pill "current")
    Runs on / Data leaves / Models / You can use / Trade-off
  PUBLIC (amber pill "leaves your network")
    Runs on / Data leaves / You can use / Blocked
Below, a dashed footnote row for roadmap tiers — NOT selectable menu items.

2. PRE-FLIGHT GUARDRAIL (amber-bordered card)
Heading "Switching to Public would expose 3 internal items".
A body line explaining public inference sends the whole thread outside the network.
An inset dark list naming each at-risk item with an amber tag
("restricted", "restricted", "PII").
Two buttons: "Keep this thread Private" and "Start a clean Public thread".

3. RESIDENCY RECEIPT (table card)
Header with a green check, "Residency receipt", and a mono reference ID.
Rows, each label / value / status pill:
  Inference | model + node + city | green "in-tenancy"
  Egress | "0 bytes to external endpoints" | green "verified"
  Tools run | tool names + "both on-prem" | green "local"
  Data touched | "3 documents · Procurement space" | grey "logged"
  PII handling | "2 names redacted before model call" | green "masked"
  Retention | "Thread 90 days · prompt logs 30 days · no training use"
  Audit | "Exportable to Compliance · signed sha256:…"

Also render a small network diagram: a dashed green boundary labelled
"YOUR NETWORK — KSA" containing user + data sources + GPU cluster nodes, and
OUTSIDE it a dimmed "Public cloud / not contacted" node with a red ✕ on the
severed link.

Style: #080A0F background, #12161F cards, green #22C55E, amber #F5A524,
blue #3B82F6, text #EAEEF5/#98A3B6/#606B80. Self-contained HTML+CSS.
```

---

## 4 · Skills

### What it is
The extension system — 18 installed capabilities the model can invoke, plus the ability to add more.

### Where it lives
`/skill` (Connections › Skills) and the composer's Tools → `Skills 18/18` checkbox list.

### What it does today

Page has **`Import from GitHub`** and **`Upload skill`** buttons and a refresh icon. Each skill is a row with a name, a `Built-in` or `Company` tag, a description, and an on/off toggle.

**The 15 built-in skills:**

| Skill | What it actually does |
|---|---|
| `agents` | Create/list/edit/delete subagents from chat |
| `files` | Read/write/search uploaded files, saved files, **and files on a connected remote desktop** |
| `heartbeat` | Manage `HEARTBEAT.md`, the periodic agent loop |
| `knowledge-base` | Search the RAG index before answering |
| **`magna-api-skill-generator`** | **Turn any third-party API into a callable skill** from an OpenAPI/Swagger URL — *or from a PDF, Word doc, wiki page, or screenshot describing the API*. Also rotates credentials and fixes auth schemes |
| **`magna-canvas-document`** | Opens a **live editable right-side document canvas**, iterate via chat, export `.docx` |
| **`magna-canvas-slide`** | Opens a **live editable slide canvas** with AI images and Magna branding, export `.pptx` |
| `magna-generate-docx` / `-pdf` / `-pptx` / `-markdown` | One-shot file generation |
| `magna-guided-help` | In-product help — explains features in plain language and says where to click |
| `meeting-notes` | Summaries, action items, decisions, from transcripts |
| `schedule` | Create/edit/pause cron schedules from chat |
| `web-search` | Multi-engine search + URL fetch, no API key |

**The 3 company skills:**

| Skill | State |
|---|---|
| `elon-musk-perspective-en` | 🔴 **`(failed to parse SKILL.md)`** — a broken skill shipped to users with a raw parser error as its description |
| `jira-ticket-definer` | Guides ticket definition, creates in the `MGAI` project. Trigger list includes Chinese phrases (`建 ticket`, `開一張票`) |
| `salesforce-uat-api` | 🔴 `Credential needed` · `Generated` · description exposes `https://magnaai--uat.sandbox.my.salesforce.com/services/data/v66.0`. A **UAT sandbox endpoint** in a production skill list |

### What's good
This is the most valuable part of the product and nobody knows it exists. `magna-api-skill-generator` alone — *"share a screenshot of an API doc and get a callable tool"* — is a headline feature. The two canvas skills are a full document/deck co-authoring experience.

### UX problems

🔴 **Skill descriptions are LLM system prompts shown verbatim to humans.** The `files` skill reads: *"The ONLY invocation is execute_skill_script(script_name="files/files.py", script_args=[verb, …]). Verbs: list | search | read | stat | write | copy | replace. Do NOT invent other script names like search.py or list.py — they don't exist."* That is instruction text for a model, rendered in a settings page for a procurement lead.

🔴 **A broken skill and a UAT sandbox endpoint are live in the list.**

🟠 **All 18 are on by default with no grouping.** The user is asked to make an 18-way decision they cannot evaluate. In the composer they appear as a raw checkbox list with descriptions cut mid-sentence.

🟠 **The canvases are invisible.** Nothing in the UI tells you a document or slide canvas exists. You have to say the right sentence in chat.

🟠 **`Import from GitHub` and `Upload skill` have no explanation** of what a skill file is, what format, or what happens on failure — and the only visible example of failure is the broken Elon skill.

🟡 No search, no category filter, no usage counts, no "last used", no per-skill test button.

### Redesign

- **Two-audience split.** A `Capabilities` gallery for users — cards with a human sentence, an example prompt, and a "Try it" button. A `Skill registry` for builders — the raw manifests, versions, parse errors, logs.
- **Group by outcome**, not by name: *Create documents · Search & research · Connect systems · Automate · Meetings.*
- **Auto by default.** Skills are selected by the model; the checkbox list becomes an "advanced override".
- **Surface the canvases as first-class actions**: a `Create` menu in the composer offering Document / Deck / PDF / Markdown, which opens the canvas directly.
- **Promote the API skill generator to a wizard**: paste a URL / drop a PDF / drop a screenshot → preview the detected operations → choose auth → test one call → save. This is the killer demo.
- Health states: `Ready` · `Needs credential` · `Broken — view log` · `Sandbox — not for production`.

### 🛠 Build prompt

```
Design a two-audience "Capabilities" system for an enterprise AI platform. Dark theme.

SCREEN A — CAPABILITIES GALLERY (for end users)
Header "What Magna can do" + a search field + category chips:
Create documents · Search & research · Connect systems · Automate · Meetings.
A responsive grid of capability cards. Each card:
  - an icon, a HUMAN name ("Build a Word document", not "magna-canvas-document")
  - one plain sentence of value
  - a quoted example prompt in a subtle inset ("Draft a 2-page brief on…")
  - a "Try it" button, and a health pill: Ready / Needs credential / Unavailable
Feature one card as a large hero: "Turn any API into a tool — paste a link, drop
a PDF, or even a screenshot of the docs."
NEVER show internal identifiers, script paths, or model-facing instruction text.

SCREEN B — SKILL REGISTRY (for builders, behind an "Advanced" tab)
A dense table: Name (mono) / Source (Built-in, Company, Generated) / Version /
Status / Last used / Invocations / toggle. Status pills include a red
"Parse error" state with a "View log" link. Row expansion reveals the raw
manifest in a code block. Top-right: "Upload skill" and "Import from GitHub",
each with a short explainer line and a link to the format spec.
Add a red banner pattern for skills pointing at non-production endpoints:
"Sandbox endpoint — hidden from non-admin users."

SCREEN C — API-TO-SKILL WIZARD (4 steps, horizontal stepper)
  1. Source — three big drop targets: paste OpenAPI URL / upload a spec /
     drop a PDF or screenshot of the docs
  2. Review — a table of detected operations with checkboxes and inferred
     method + path
  3. Auth — cards for Bearer / API key header / Basic / OAuth2, plus a masked
     credential field and the note "Stored encrypted; never shown again."
  4. Test — run one operation, show the request and response side by side,
     then "Save as skill"

Style: background #080A0F, cards #12161F, borders rgba(255,255,255,.075),
text #EAEEF5/#98A3B6/#606B80, accent #3B82F6, green #22C55E, amber #F5A524,
red #F43F5E. Monospace ONLY inside the builder screens. Self-contained HTML+CSS.
```

---

## 5 · Tools & MCPs

### What it is
Built-in agent tools plus Model Context Protocol server connections.

### Where it lives
`/tool-mcp` (Connections › Tools & MCPs), and the composer's Tools → `{} MCP`.

### What it does today

**Built-in tools — 10, always available, grouped:**

| Tool | Description | Group |
|---|---|---|
| Current time | Return the current datetime | `time` |
| Run skill | Invoke an enabled skill by name | `core` |
| Notify user | Send the user an out-of-band alert | `core` |
| Email file | Send a workspace file or artifact as an email attachment | `messaging` |
| Message a contact | Send a direct message to another user | `messaging` |
| Send task request | **Ask a peer agent to do a task** | `messaging` |
| Send task response | Reply to a task request | `messaging` |
| Check messages | List pending incoming messages | `messaging` |
| List contacts | List reachable peer agents | `messaging` |
| Generate image | Create an image from a prompt | `media` |

That messaging group is an **agent-to-agent delegation network** — one user's agent can send work to another user's agent. There is no UI for it anywhere.

**MCP servers — 4, hard-coded:**

| Server | Endpoint shown to the user | State |
|---|---|---|
| Atlassian | `http://atlassian-mcp.magna-system.svc.cluster.local:3000/mcp` | Sign-in required · OAuth · **No tools** |
| Google Workspace | `http://google-workspace-mcp.magna-system.svc.cluster.local:8000/mcp` | same |
| Microsoft 365 | `http://ms365-mcp.magna-system.svc.cluster.local:3000/mcp` | same |
| Slack | `http://slack-mcp.magna-system.svc.cluster.local:3000/mcp` | same |

### UX problems

🔴 **Raw Kubernetes service DNS is the primary text of every MCP card.** `*.magna-system.svc.cluster.local` tells a user nothing, tells an attacker something, and makes the product look like an internal admin console.

🔴 **There is no way to add an MCP server.** No `+ Add server` button anywhere. The whole point of MCP is bring-your-own; the catalogue is frozen at four.

🟠 **Contradictory state.** Each server shows an enabled blue toggle *and* `Sign-in required` *and* `No tools`. Three signals, no clear meaning. What does the toggle do if nothing is connected?

🟠 **Zero explanation of value.** Nothing says what connecting Slack would let you *do*.

🟠 **The agent-to-agent messaging network is completely unexposed** — no contacts page, no inbox, no delegation UI, despite five built-in tools for it.

🟡 The composer's `{} MCP` entry appears to do nothing distinct.

### Redesign

- **Connector catalogue**, not a server list. Logo, name, one-line value, `Connect` primary action. Endpoint hidden behind an "Advanced / technical details" disclosure for admins only.
- **`+ Add MCP server`** with two modes: *From catalogue* and *Custom* (URL, transport, auth, health check, then a tool-discovery preview).
- Single honest status per card: `Not connected` → `Connecting` → `Connected · 14 tools` → `Error · view log`.
- Post-connect, list the discovered tools with plain-language names and a per-tool permission default.
- Build the missing surface: **Contacts & delegation** — see who your agent can reach, an inbox of inbound task requests, and an outbox of what you've delegated.

### 🛠 Build prompt

```
Design a "Connections" hub for an enterprise AI platform, dark theme.
Three tabs: Catalogue · Connected · Advanced.

CATALOGUE
A grid of connector cards. Each: brand logo tile, name, ONE plain sentence of
value ("Read and create Jira issues, search Confluence"), a "Connect" button,
and a small tool-count chip once connected. Group into sections: Work
management · Communication · Storage · CRM · Custom.
Never display an internal hostname on these cards.
Include a dashed "＋ Add a custom MCP server" tile as the last card.

ADD-SERVER MODAL (4 fields + verification)
Name · Server URL · Transport (SSE / HTTP / stdio) · Auth (None / OAuth /
Bearer / Header). A "Test connection" button that transitions through
"Reaching server… → Discovering tools… → Found 14 tools". Then a discovered-tools
table with checkboxes, each row showing tool name, description, and a
permission dropdown (Always ask / Auto-approve / Blocked). Save button disabled
until the test passes.

CONNECTED TAB
Rows with a single unambiguous status pill — Not connected / Connecting /
Connected · N tools / Error — a last-sync timestamp, and an overflow menu
(Reconnect, Permissions, View logs, Remove). Technical endpoint details live
behind a collapsed "Technical details" disclosure, visible to admins only.

DELEGATION PANEL (new surface, same page family)
Title "Your agent's network". Left: a contacts list of reachable peer agents
with owner name, role, and availability dot. Right: two stacked inboxes —
"Requests to you" and "Requests you sent" — each item showing requester, the
ask, a status chip (Pending / Running / Done / Declined), and Accept / Decline
actions. Include an empty state that explains what agent-to-agent delegation is
in two sentences.

Style: background #080A0F, cards #12161F, hairline borders, text
#EAEEF5/#98A3B6/#606B80, accent #3B82F6, green #22C55E, amber #F5A524,
red #F43F5E. Self-contained HTML+CSS.
```

---

## 6 · Agents (subagents)

### What it is
Configurable delegate personas with their own prompt, model, tool set, and autonomy settings.

### Where it lives
`/agent` — reached via `Tasks` → `Tasks`.

### What it does today

**🔴 Four different nouns for one concept, in four consecutive views:**

```
Nav item        →  "Tasks"
Page title      →  "Tasks"
Page subtitle   →  "Custom roles for delegation"
Primary button  →  "+ New agent"
Next screen     →  "Create subagent"
```

**Creation offers four paths:** `Create manually` · `From template` · `Import from JSON` · `Create with AI` ("Describe what you want; an AI drafts the config").

**Ten curated templates** across 5 categories with a filter bar:

| Template | Category |
|---|---|
| Researcher | Research |
| Code Reviewer | Engineering |
| Meeting Summarizer | Productivity |
| Email Drafter | Communication |
| Calendar Planner | Productivity |
| PR Describer | Engineering |
| Data Analyst | Data |
| Message Triage | Communication |
| Document QA | Research |
| DevOps Helper | Engineering |

**The editor — 4 tabs:**

| Tab | Fields |
|---|---|
| **Basics** | Name · Description · System prompt (pre-filled from template) · Model (`__inherit__`) |
| **Skills & Tools** | *Required skills* (18 checkboxes) · *Required MCP servers* (4, again with raw cluster URLs) · *Required built-in tools* (10 checkboxes) |
| **Advanced** | `Restrict tools` — "When on, the subagent can only use the tools you select here (instead of inheriting the full tool set)" |
| **Settings** | `Enabled` · `May interrupt the user` — "Let this subagent pause mid-task to ask you a clarifying question. Turn off for fully automated subagents." |

### What's good
The four creation paths are excellent. The templates are well written. `May interrupt the user` and `Restrict tools` are exactly the right autonomy controls, and their microcopy is the best in the product.

### UX problems

🔴 **The naming.** Task / agent / subagent / custom role are used interchangeably. A user cannot form a mental model.

🟠 **The empty state hides everything.** `Nothing here yet` in a bare table. Ten good templates, an AI-drafted path, and a JSON import all sit behind a button labelled with the wrong noun.

🟠 **Templates are for a software team, not for Magna's buyer.** Code Reviewer, PR Describer, DevOps Helper — in a product whose homepage says *"enterprise operational brain"* and whose demo app is *Health Care*. There is no Procurement Analyst, Contract Reviewer, HSE Reporter, Vendor Screener, or Compliance Checker.

🟠 **`__inherit__` is a raw code token in a user-facing dropdown.**

🟠 **Three flat checkbox lists (18 + 4 + 10 = 32 checkboxes) with no search, no grouping, no "select recommended".**

🟡 No test/preview before saving. No usage history. No versioning. No duplicate.

🟡 Agents can't be invoked visibly from chat — no `@agent` mention pattern in the composer.

### Redesign

- **Pick one word: Agents.** Nav, page, button, screen. "Task" is reserved for scheduled work.
- **Template gallery as the empty state**, not a blank table.
- **Rewrite the template library for the actual market**: Procurement Analyst · Contract Clause Reviewer · HSE Incident Reporter · Vendor Risk Screener · Schedule Slip Analyst · Compliance Checker · Meeting Summariser · Document QA · Data Analyst · Researcher.
- **Model dropdown**: `Same as chat (recommended)` instead of `__inherit__`.
- **Replace 32 checkboxes with a two-step permission builder**: choose a preset (`Read-only research` · `Documents & reports` · `Connected systems` · `Full access`), then refine.
- **Add a test panel** in the editor: run a sample prompt against the draft config and see the trace before saving.
- **`@mention` agents in the composer** with an autocomplete.

### 🛠 Build prompt

```
Design an "Agents" section for an enterprise AI platform, dark theme.
Use the word "agent" consistently — never task, subagent, or custom role.

SCREEN 1 — GALLERY AS EMPTY STATE
Header "Agents" + subtitle "Delegate repeatable work to a configured specialist."
Primary "Create agent" button, plus a secondary "Start from a template".
When no agents exist, do NOT show an empty table — show the template gallery
directly, with a one-line intro: "Pick a starting point. You can edit every
field before saving."
Category filter chips: All · Procurement · Delivery · Compliance · Research ·
Productivity. Template cards each with a name, a category pill, a two-line
description, and a "Use this" button.
Templates: Procurement Analyst, Contract Clause Reviewer, HSE Incident Reporter,
Vendor Risk Screener, Schedule Slip Analyst, Compliance Checker, Meeting
Summariser, Document QA, Data Analyst, Researcher.
Above the gallery, four creation-path tiles: Start from template · Describe it
and let AI draft it · Build manually · Import JSON.

SCREEN 2 — AGENT EDITOR (4 tabs, but restructured)
  Identity — Name, one-line purpose, avatar colour, and a "How it should behave"
    rich textarea with 3 insertable example blocks. Model dropdown whose default
    option reads "Same as chat (recommended)" — never a code token.
  Access — replace long checkbox lists with FOUR preset cards
    (Read-only research / Documents & reports / Connected systems / Full access),
    each listing what it grants in plain words. Below, a collapsed
    "Fine-tune permissions" disclosure containing the grouped, searchable
    tool list.
  Autonomy — two clearly explained switches:
    "May pause to ask you a question" and
    "Restrict to the tools selected above".
    Add a third: "Requires approval before actions that send, publish, or delete."
  Test — a prompt box, a Run button, and a live trace panel showing each step and
    tool call, with a verdict banner ("Used 3 tools · asked 1 question · 8s").

SCREEN 3 — AGENT LIST (once agents exist)
Table: Name+avatar / Purpose / Access preset / Last run / Runs this week /
Status toggle / overflow (Duplicate, Test, Export JSON, Delete).

Style: background #080A0F, cards #12161F, borders rgba(255,255,255,.075),
text #EAEEF5/#98A3B6/#606B80, accent #3B82F6, green #22C55E, amber #F5A524.
Self-contained HTML+CSS.
```

---

## 7 · Tasks — Heartbeat & Schedules

### What it is
Two different automation engines: a standing checklist reviewed on a loop, and cron-driven jobs.

### Where it lives
`/heartbeat` and `/schedule`, both under `Tasks`.

### What it does today

**Heartbeat** (`/heartbeat`) — *"A standing checklist your agent reviews on a schedule, notifying you only when something needs attention."*
- Edits a file called `HEARTBEAT.md`, shown read-only with an `Edit` button and a `Run history` button.
- Helper text: *"Describe what you'd like your agent to do every 30 minutes. **The pod runs a heartbeat tick automatically.**"*
- Schedule control: `every` + N + `minutes`/`hours`.
- Placeholder: *"e.g. Check my email and summarize anything urgent. Review today's calendar and draft prep notes."*
- Live counter: `0 chars · 0 words`.

**Schedules** (`/schedule`) — *"Cron jobs for your agent"*. Table: Schedule / Cron / Next run / Status.

**`New schedule` modal — the best-designed component in the product:**

| Field | Detail |
|---|---|
| Name | placeholder "Morning brief" |
| When to run | `Every` / `At` / `Cron` |
| Every + Unit | `30` + `minutes` |
| What should this schedule do? | natural-language textarea, placeholder *"e.g., generate a daily sales report every weekday at 9am"* |
| — | link: **"Need help? Design in chat →"** |
| Enabled | toggle, on |
| **Auto-approve tools** | toggle, off — *"Let this task run tools that normally ask for approval (e.g. send email). Off: the run stops and notifies you instead."* |

### What's good
The schedule modal is genuinely excellent: progressive disclosure from `Every` → `At` → `Cron`, natural-language intent instead of a DSL, an escape hatch into chat, and a beautifully worded autonomy toggle. **Make this the template for every creation flow in the product.**

### UX problems

🔴 **"The pod runs a heartbeat tick automatically."** Kubernetes vocabulary in end-user helper text.

🟠 **Heartbeat and Schedules are the same idea with different UIs.** Both run agent prompts on an interval. One edits a markdown file with a word counter; the other has a polished modal. A user has no way to know which to use.

🟠 **`HEARTBEAT.md` is exposed as a filename.** Also `SOUL.md`, `STYLE.md`, `TASK_REQUEST.md` elsewhere. Users are being shown the storage format.

🟠 **`Tasks` in the nav leads to Agents, not to tasks.** The two things that *are* tasks (Heartbeat, Schedules) sit beside it under the same label.

🟡 No run history visible on the Schedules page — no last run, duration, output, or failure.

🟡 Nothing surfaces overnight results. If a schedule ran at 06:00 and found three incidents, you will not know unless you go looking.

### Redesign

- **Merge into one "Automations" surface** with two trigger types: `On a schedule` and `Continuously (watch for conditions)`. Same creation modal for both.
- **Kill the filenames.** The heartbeat becomes a checklist UI with rows, not a markdown blob.
- **Run history is first-class**: a timeline of runs with status, duration, what it did, what it found, and a "Notify me when…" rule.
- **Overnight results surface on the home screen** as resume cards.
- Rename the nav item to `Automations`; `Agents` becomes its own item.

### 🛠 Build prompt

```
Design an "Automations" surface for an enterprise AI platform, dark theme.
It replaces two separate features (a markdown-file "heartbeat" loop and a cron
"schedules" table) with one coherent model.

LIST VIEW
Header "Automations" + subtitle "Work that runs without you."
Primary "New automation".
Segmented filter: All · Scheduled · Watching · Paused.
Each row: name, a trigger chip ("Weekdays 06:00" or "Every 30 min · watching"),
last run with a status dot, a one-line result summary
("3 incidents flagged"), next run, an enabled toggle, and an overflow menu.
Rows with a failed last run show a red left border and a "View error" link.

CREATE MODAL (model it on a clean 6-field form)
  Name
  Trigger — segmented: On a schedule / Watch continuously
    → schedule: Every / At / Cron (progressive; Cron reveals a field with a
      human-readable preview under it, e.g. "Weekdays at 9:00 AM Riyadh")
    → watch: an interval plus "Only notify me when…" condition field
  What should this do? — a natural-language textarea, never a markdown file
  A helper link "Need help? Design it in chat →"
  Enabled toggle
  "Auto-approve tools" toggle, OFF by default, with the explanation:
    "Let this run tools that normally ask for approval (e.g. send email).
     Off: the run pauses and notifies you instead."
Never show a filename like HEARTBEAT.md, and never use words like pod,
container, cron tick, or job.

RUN DETAIL DRAWER
Timeline of steps with durations and tool calls, the produced output, and three
actions: "Send to chat", "Save to workspace", "Adjust this automation".

WATCH CHECKLIST EDITOR
For "watch continuously" automations, replace the markdown blob with a checklist
UI: rows of conditions, each with a plain-language statement, a source chip
(Email, Calendar, SAP, Knowledge base), and a "notify when" rule. Add row / drag
to reorder.

Style: background #080A0F, cards #12161F, borders rgba(255,255,255,.075),
text #EAEEF5/#98A3B6/#606B80, accent #3B82F6, green #22C55E, amber #F5A524,
red #F43F5E. Self-contained HTML+CSS.
```

---

## 8 · Knowledge (RAG)

### What it is
The retrieval layer — document ingestion, chunking, embedding, and search.

### Where it lives
`/rag` — reached via `Connections › Knowledge`. Route name is the implementation name.

### What it does today

Five tabs: **Dashboard · Documents · Search · Cloud storage · Status**, plus a refresh icon and an auto-refresh dropdown currently reading `off`.

| Tab | Content |
|---|---|
| **Dashboard** | Stat cards: `Indexed documents 0` · `Total chunks 0` · `Pending 0` · `Embedding model auto` · `Last ingest —` |
| **Documents** | Drop zone, "Max 100 MB", `Choose files`, then a table (File / Size / Chunks / Status / Added) reading `Nothing here yet` |
| **Search** | A query field and `Search` button; empty message *"Enter a query to search across indexed documents."* |
| **Cloud storage** | Google Drive · OneDrive · Dropbox, all `Not connected`, each with a `Connect` button |
| **Status** | 🟡 Renders the Cloud-storage cards **and** the Dashboard stats concatenated — it has no content of its own |

Settings → Knowledge contains exactly one control: `Enable OCR on document upload` (on).

### What's good
The pipeline is transparent — chunks, pending, embedding model, last ingest are the right metrics. The Documents drop zone is clean.

### UX problems

🟠 **The `Status` tab is a duplicate.** Two other tabs' content stacked together.

🟠 **No spaces, folders, or permissions.** Every document goes into one flat index. An enterprise knowledge base needs `Procurement`, `HSE`, `Legal` with per-space access — and the chat's residency guarantee depends on knowing which space an answer came from.

🟠 **No connection between Knowledge and the chat's "Company knowledge" toggle.** The user cannot see which documents are in scope for a given conversation.

🟠 **`Embedding model: auto` is unexplained**, while the Usage page reveals it is actually `azure/text-embedding-3-small` and `-3-large` — again, an external endpoint under a `Private` badge.

🟡 No per-document actions (reindex, delete, preview, permissions). No ingestion error surface. No supported-format list. `Max 100 MB` per file or in total is ambiguous.

🟡 Search returns raw chunks with no answer synthesis and no "ask about this" handoff into chat.

### Redesign

- Rename the route and the nav item to **Company knowledge**.
- **Spaces** as the top-level object: name, description, members, residency lock, document count.
- Documents table gains: status (`Queued / OCR / Chunking / Indexed / Failed`), chunk count, source, owner, and row actions.
- **Search becomes an answer surface**: a synthesised answer with citations, the matched chunks beneath, and a "Continue in chat" button.
- **Bidirectional link with chat**: the composer's `Company knowledge` chip opens a scope picker showing which spaces are in play.
- Cloud storage connectors state what will be synced, how often, and whether the content leaves the network.

### 🛠 Build prompt

```
Design a "Company knowledge" section for an enterprise AI platform, dark theme.
Never use the word RAG, chunk-count jargon aside, or expose route names.

SPACES OVERVIEW
Grid of space cards: name, description, document count, total size, a residency
lock pill ("Private only"), member avatars, and a last-indexed timestamp.
Plus a dashed "＋ New space" tile.

SPACE DETAIL — four tabs: Documents · Ask · Connections · Access
  Documents — drop zone with an explicit supported-format list and size limit,
    then a table: File / Source / Size / Chunks / Status / Added / actions.
    Status is a pill with a progress state: Queued → OCR → Chunking → Indexed,
    plus a red "Failed — view reason" state. Row actions: Preview, Reindex,
    Move, Delete.
  Ask — a search field that returns a SYNTHESISED answer with numbered inline
    citations at the top, then the matching passages beneath, each showing the
    source document, page, and a relevance bar. A "Continue in chat" button.
  Connections — Google Drive / OneDrive / Dropbox / SharePoint cards. Each
    states what will sync, how often, and a residency note
    ("Files are copied into your private index; originals stay in place").
  Access — members and roles, plus an inheritance note.

HEALTH STRIP (top of space detail)
Four compact stats: Indexed documents · Passages · Pending · Last ingest.
Show the embedding model as a human label with a tooltip revealing the technical
identifier — and a residency badge next to it.

CHAT SCOPE PICKER (a popover, not a page)
Triggered by a "Company knowledge" chip in the composer. Lists spaces with
checkboxes, a document count each, and a footer line
"Magna will search 2 spaces · 8,412 documents before answering."

Style: background #080A0F, cards #12161F, borders rgba(255,255,255,.075),
text #EAEEF5/#98A3B6/#606B80, accent #3B82F6, green #22C55E, amber #F5A524,
red #F43F5E. Self-contained HTML+CSS.
```

---

## 9 · Channels

### What it is
Reaching Magna from outside the web app.

### Where it lives
`/channel` (Connections › Channels).

### What it does today

Subtitle: *"Connect WhatsApp, Telegram, Teams"*. Four cards: **Microsoft Teams**, **Zoom**, **WhatsApp** (greyed out), **Telegram**. All `Not connected`.

**Telegram flow — a good two-step pattern:**
1. *Step 1 · Create your bot* — a QR code, the instruction *"Scan to open @BotFather on Telegram, send /newbot, then copy the API token"*, and an `Open @BotFather in browser` link.
2. *Step 2 · Paste the bot token* — a text field with placeholder `123456:ABC-…` and a `Connect` button.

### UX problems

🟠 **The subtitle doesn't match the content** — it names three services, one of which (WhatsApp) is disabled, and omits Zoom.

🟠 **No statement of value.** Nothing explains what connecting Telegram gives you: can you chat with Magna from your phone? Do automations push results there? Can your agent message a colleague?

🟠 **A bot token is pasted in plain text** with no masking, no "stored encrypted" reassurance, and no rotation path.

🟡 Zoom sits beside three messaging apps with no explanation of what a Zoom "channel" means (meeting transcripts? that would pair with the `meeting-notes` skill — but nothing says so).

🟡 No post-connection state design — no test message, no "connected as", no disconnect.

### Redesign

- Reframe as **"Where Magna reaches you"**: each card leads with the outcome — *"Ask Magna from your phone"*, *"Get automation results in your team channel"*, *"Auto-summarise every Zoom meeting"*.
- Each connector gets: what you can do · what data crosses the boundary · a residency warning where relevant (a message sent to Telegram has left your network).
- Mask credential fields, state encryption, offer rotation.
- Post-connect: "Connected as @magna_bonyad_bot · Send a test message · Disconnect".

### 🛠 Build prompt

```
Design a "Where Magna reaches you" channels page for an enterprise AI platform,
dark theme.

CARD GRID — each connector card leads with an OUTCOME, not a product name:
  Telegram — "Ask Magna from your phone"
  Microsoft Teams — "Get automation results in your team channel"
  WhatsApp — "Chat with Magna where your field teams already are"
  Zoom — "Auto-summarise every meeting into action items"
Each card: brand logo, outcome headline, one supporting sentence, a status pill
(Not connected / Connected / Coming soon), and a Connect button.
Below the fold, an amber note card: "Messages delivered to an external channel
leave your network. Residency guarantees end at the boundary." with a
"Configure what may be sent" link.

CONNECT FLOW (drawer, numbered steps)
Step 1 — a QR code panel with instructions and an "Open in browser" fallback link
Step 2 — a MASKED credential field showing only the last 4 characters, with a
  reassurance line "Stored encrypted. Never displayed again." and a
  "Paste from clipboard" affordance
Step 3 — "Verify" button running a live check, then a success panel showing
  "Connected as @magna_bot", a "Send a test message" button, and a summary of
  what is now enabled.

CONNECTED STATE
Card shows: connected identity, last message time, a permissions summary
("Can send you results · Cannot read your other chats"), Test, Rotate
credential, and Disconnect.

Style: background #080A0F, cards #12161F, borders rgba(255,255,255,.075),
text #EAEEF5/#98A3B6/#606B80, accent #3B82F6, green #22C55E, amber #F5A524.
Self-contained HTML+CSS.
```

---

## 10 · Artifacts & the Canvas

### What it is
Generated files, and a live side-panel editor for documents and decks.

### Where it lives
Artifacts: `/artifacts` (Workspace › Artifacts).
Canvas: **no UI entry point at all** — only via the `magna-canvas-document` / `magna-canvas-slide` skills, triggered by phrasing in chat.

### What it does today

**Artifacts page:** search field, an `All` / `Session` segmented toggle, an `All` filter chip, and `No artifacts yet`. Sibling nav items *Document*, *Image*, *Code* are permanently disabled.

**The canvas** (per its skill manifests): opens a live editable right-side panel, lets the user iterate on content and layout via chat, and exports a real `.docx` or a Magna-branded `.pptx` with AI-generated images.

### UX problems

🔴 **The best feature in the product has no entry point.** A document and slide co-authoring canvas exists and is reachable only by guessing the right sentence. Nothing in the composer, the Workspace section, or the empty state mentions it.

🟠 **`Workspace › Document / Image / Code` are disabled** — exactly the filters that would make Artifacts useful.

🟠 **Two competing generation paths** (`magna-canvas-*` vs `magna-generate-*`) with no user-visible difference, resolved by a model-facing "preferred over" note buried in a skill description.

🟡 Empty state teaches nothing.

### Redesign

- **Add a `Create` control to the composer**: Document · Deck · Spreadsheet · PDF · Image · Diagram. Each opens the canvas directly.
- **Canvas as a designed surface**: split view, chat left, live document right, section-level "regenerate this part", version history, and an export bar (`.docx` / `.pptx` / `.pdf` / share link).
- Retire `magna-generate-*` from the user-visible layer; the canvas is the one path.
- Artifacts becomes a real library: type filters that work, thumbnail previews, source conversation link, version count.

### 🛠 Build prompt

```
Design a document/deck CANVAS and an artifacts library for an enterprise AI
platform, dark theme.

CANVAS (split view)
LEFT 40% — the chat thread, narrow, with the user steering
  ("make section 3 shorter", "add a risk table").
RIGHT 60% — a live rendered document on a light paper surface inside the dark
  chrome, so it reads like the real output. A floating section toolbar appears
  on hover over any block with: Regenerate, Expand, Shorten, Rewrite in my
  style, Delete.
TOP BAR of the canvas: document title (editable), a format switcher
  (Document / Deck / PDF), a version chip ("v4 · 12:41"), and an Export
  split-button (.docx / .pptx / .pdf / Share link).
LEFT EDGE of the canvas: an outline rail listing sections, drag to reorder,
  with a completion dot per section.
For the DECK variant, replace the paper surface with a slide sorter: a filmstrip
  of slide thumbnails on the left of the canvas and a large current-slide
  preview, with per-slide "regenerate image" and layout-swap controls.

COMPOSER ENTRY POINT
Show the chat composer with a "Create" button that opens a menu:
Document · Deck · Spreadsheet · PDF · Image · Diagram — each with a one-line
description. This is the discoverable path into the canvas.

ARTIFACTS LIBRARY
Grid of file cards, each with a real thumbnail preview, file name, type pill,
size, created time, the source conversation as a link, and a version count chip.
Working filter chips: All · Documents · Decks · Sheets · Images · Code.
Left rail filters: This session · This project · All time · Shared with me.
Card hover actions: Open in canvas, Download, Share, Delete.
Empty state: "Anything Magna creates for you lands here — documents, decks,
spreadsheets and images." plus three example-type tiles that start a creation.

Style: background #080A0F, chrome #12161F, borders rgba(255,255,255,.075),
text #EAEEF5/#98A3B6, accent #3B82F6. The document paper surface should be a
warm off-white (#F7F5F1) with dark text for realism. Self-contained HTML+CSS.
```

---

## 11 · Memory

### What it is
Cross-conversation recall of facts about the user.

### Where it lives
Settings → **Memory**. Per-message: the brain icon in the action row.

### What it does today

Settings → Memory:
- `Enable memory recall` (on)
- `Recall limit` — a number field, `5`, helper *"Items recalled per turn (1–20)"*
- `Enable memory extraction` (on)

Per-message panel shows retrieved memories as:

```
MEDIUM   explicit                          0.18
User wants to learn coding.
memories:context/interest-learning-coding
```

### UX problems

🔴 **Raw memory keys and relevance scores are shown to end users.** `memories:context/interest-learning-coding` and `0.18` are database internals.

🟠 **There is no memory management page.** You can toggle memory and set a recall limit, but you cannot see everything Magna remembers, edit it, delete one item, or clear it. That is a privacy expectation, and in some jurisdictions a legal one.

🟠 **`Recall limit: 5` asks the user to tune a retrieval parameter.**

🟠 **The recalled memory was irrelevant** — a coding-interest memory surfaced on a Saudi construction-risk question, with the low score (0.18) visible. Showing a weak match with its score undermines confidence more than showing nothing.

🟡 The brain icon has no tooltip; nothing indicates what it opens.

### Redesign

- **"What Magna remembers about you"** — a real page. Grouped (Role & team · Preferences · Projects · Facts), each item editable and deletable, with the conversation it came from and a date.
- **Confirm on capture**: an unobtrusive inline chip after a turn — *"Remembered: you report to Delivery, not Commercial. Undo"*.
- Replace `Recall limit` with `Memory: Off / Balanced / Extensive`.
- Hide scores; suppress low-confidence matches instead of displaying them.
- Add **Export my memories** and **Clear all** with a confirmation.

### 🛠 Build prompt

```
Design a "What Magna remembers" page plus its in-chat surfaces, dark theme.

MAIN PAGE
Header "What Magna remembers about you" + subtitle
"Everything here shapes your answers. Edit or remove anything."
A search field and a "Clear all" destructive text button top-right.
Grouped sections with counts: Role & team · Working preferences · Projects &
systems · Facts you've told me.
Each memory row: the fact stated in the FIRST PERSON of the user
("I report to Delivery, not Commercial"), a source chip linking to the
conversation it came from, a captured date, and hover actions Edit / Forget.
Never show a database key, a namespace path, or a numeric relevance score.
Bottom of page: a card with three controls —
  Memory: segmented Off / Balanced / Extensive (with one line explaining each)
  "Ask before remembering" toggle
  "Export my memories" button

IN-CHAT CAPTURE CHIP
A small, low-emphasis inline chip that appears beneath an assistant message:
"⊕ Remembered: you report to Delivery, not Commercial — Undo · Don't remember
this". Muted, one line, dismissible.

IN-CHAT RECALL PANEL
A popover from a labelled "Memory" action showing the 1–3 memories that shaped
this answer, phrased in plain language, each with "This is wrong" and "Forget"
actions. If nothing confident was recalled, show
"No stored memories were used for this answer" rather than a weak match.

Style: background #080A0F, cards #12161F, borders rgba(255,255,255,.075),
text #EAEEF5/#98A3B6/#606B80, accent #3B82F6, destructive #F43F5E.
Self-contained HTML+CSS.
```

---

## 12 · Personality — SOUL, STYLE and message policies

### What it is
Five markdown files that define the agent's identity, voice, and inter-agent etiquette.

### Where it lives
`/profile` → **Personality** tab → five sub-tabs.

### What it does today

| Tab | File | Seed content |
|---|---|---|
| **Soul** | `SOUL.md` | *"You are a personal AI assistant. You serve one user and remember them across conversations. You are direct, pragmatic, and curious. You favour clarity over ceremony. When you do not know something, you say so — you do not bluff."* |
| **Style** | `STYLE.md` | *"Short sentences. Active voice. Lead with the answer… Avoid filler phrases, no 'great question!', no 'I hope this helps'. Match the user's tone."* |
| **Task request** | `TASK_REQUEST.md` | *"When sending a task request to another agent: state the outcome you need, not the steps… Include every input the other agent needs: IDs, deadlines, constraints."* |
| **Task response** | `TASK_RESPONSE.md` | — |
| **On message** | `ON_MESSAGE.md` | — |

Each is a read-only viewer with an `Edit` button and a `370 chars · 66 words` counter.

### What's good
The seed content is well written — better than most products' default assistant prompts. `TASK_REQUEST.md` and `TASK_RESPONSE.md` reveal a thought-through agent-to-agent protocol.

### UX problems

🟠 **It's five raw markdown files behind a tab called "Personality" inside a page called "Profile".** No user will find it, and none will know that editing `SOUL.md` changes how every answer sounds.

🟠 **The filenames are the UI.** `SOUL.md`, `STYLE.md`, `TASK_REQUEST.md` are storage names presented as navigation.

🟠 **No preview.** You edit prose and cannot see the effect until your next chat.

🟠 **Personal vs organisational is undefined.** Can an admin set a house style all users inherit? Nothing indicates scope.

🟡 A character/word counter on an identity document is an odd emphasis.

### Redesign

- Rename the section **"How Magna behaves"** and put it one click from the composer, not inside Profile.
- Three plain-language panels: **Identity** · **Writing style** · **Working with other agents**.
- Style becomes assisted: tone sliders (formal ↔ casual, brief ↔ thorough), format preferences (bullets, tables, headings), plus a free-text box. Or: *"Paste three things you've written and I'll learn your voice."*
- **Live preview**: a fixed sample answer that re-renders as you change settings.
- **Scope badges**: `Organisation default` (locked, set by admin) vs `Your override`, with a reset.

### 🛠 Build prompt

```
Design a "How Magna behaves" settings surface, dark theme. It replaces five raw
markdown file editors (SOUL.md, STYLE.md, TASK_REQUEST.md, TASK_RESPONSE.md,
ON_MESSAGE.md). Never show a filename or a character counter.

TWO-COLUMN LAYOUT
LEFT — the controls, in three collapsible panels:
  1. Identity — "Who Magna is for you". A short rich-text field with a
     "Suggest" button, plus 4 preset chips (Direct analyst · Careful advisor ·
     Fast operator · Patient explainer) that populate it.
  2. Writing style — assisted, not free-form-only:
       two sliders: Formal ↔ Casual, Brief ↔ Thorough
       toggle chips: Lead with the answer · Use tables when comparing ·
         Always cite sources · No filler openings
       a "Learn from my writing" drop zone: "Paste or upload three things
         you've written and Magna will match your voice."
       a free-text "Anything else" field beneath
  3. Working with other agents — two plain-language cards for how Magna asks
     other agents for work and how it replies, each with 3 editable bullet
     rules rather than a prose blob.

RIGHT — a STICKY LIVE PREVIEW card titled "Preview". It shows the same sample
question and re-renders the answer as the settings change, so the effect of
every control is visible immediately. Add a "Try a different question" link.

SCOPE BADGES
Each panel carries a badge: "Organisation default" (with a lock icon and the
admin's name) or "Your override" (with a Reset to default link).

Style: background #080A0F, cards #12161F, borders rgba(255,255,255,.075),
text #EAEEF5/#98A3B6/#606B80, accent #3B82F6, green #22C55E.
Self-contained HTML+CSS.
```

---

## 13 · Permissions & tool approval

### What it is
Per-tool consent — which actions run automatically and which stop to ask.

### Where it lives
Settings → **Permissions**.

### What it does today

An explainer box: *"This list shows tools and skills you've already chosen to allow or block. To add a new entry, encounter a permission bubble in chat and click 'Always allow' or 'Always ask'. Removing an entry here reverts to the agent's default permission for that tool or skill."*

- `Trust built-in tools and skills` (on) — *"When on, magna runs built-in tools and default skills without asking. Per-item overrides below still apply."*
- Three override lists: **Built-ins** · **MCP tools** · **Skills**, each empty with *"No overrides yet. Click 'Always allow' on a permission bubble to pin a tool here."*
- Skills note: *"Keys with a slash (e.g. `github/delete_repo.py`) are per-script pins; bare names are whole-skill pins."*

### What's good
The mental model is right — trust by default with per-item overrides, learned from in-chat approvals. The explainer is clear.

### UX problems

🟠 **The permission bubble was never encountered** in an entire session, because `Trust built-in tools and skills` defaults to **on**. The system that teaches you how permissions work is disabled by the default setting.

🟠 **`github/delete_repo.py`** as the illustrative example is alarming and irrelevant to the buyer.

🟠 **No risk tiering.** "Send an email", "create a Jira ticket", and "delete a repo" are treated identically. Destructive and outbound actions should be non-optional prompts.

🟡 No audit trail of what was auto-approved and what it did.

### Redesign

- Replace the single trust switch with **three risk tiers**: `Read` (auto) · `Write & create` (auto, logged) · `Send, publish, delete, pay` (always ask — not overridable by default).
- **Design the permission bubble properly**: what will run, against which system, with what data, and Allow once / Always allow / Never.
- Add an **activity log**: every auto-approved action, with what it did and an undo where possible.
- Replace the `github/delete_repo.py` example with something from the actual domain.

### 🛠 Build prompt

```
Design a tool-permission system for an enterprise AI platform, dark theme.

SETTINGS PAGE
Three RISK TIER cards, stacked, each with an icon, a title, a description, and
a control:
  Read — "Look things up: search knowledge, read files, fetch pages."
    Control: Auto / Ask. Default Auto.
  Write & create — "Make things: draft documents, create tickets, save files."
    Control: Auto (logged) / Ask. Default Auto, with a note that every action
    is recorded.
  Send, publish, delete, pay — "Actions others will see, or that cannot be
    undone." Control: ALWAYS ASK, shown as a locked state with an
    "Admins can change this" note.
Below, an "Exceptions" table: Tool / System / Current rule / Set by / Added,
with a per-row dropdown (Auto / Ask / Blocked) and a Remove action. Grouped
tabs: Built-in · Connected systems · Skills.

PERMISSION BUBBLE (in-chat component — design this carefully, it is the
teaching moment)
An inline card in the message thread:
  Header: an action icon + "Magna wants to send an email"
  A summary block: To / Subject / Attachment, and the data being used
    ("Includes 1 internal document")
  A residency line where relevant: "This leaves your network."
  Three buttons: "Allow once" (primary), "Always allow this", "Don't allow"
  A small "Why is it asking?" link opening a one-paragraph explanation.

ACTIVITY LOG PAGE
A reverse-chronological table: Time / Action / System / Triggered by
(you, an automation, an agent) / Result / Undo link where reversible.
Filter chips: All · Auto-approved · You approved · Blocked · Failed.

Style: background #080A0F, cards #12161F, borders rgba(255,255,255,.075),
text #EAEEF5/#98A3B6/#606B80, accent #3B82F6, green #22C55E, amber #F5A524,
red #F43F5E. Self-contained HTML+CSS.
```

---

## 14 · Governance & Security

### What it is
The compliance surface.

### Where it lives
`/security` (Governance › Security). Five sibling items — *PII Detection · Guardrails · Access Control · Benchmarks · Sovereignty* — are all disabled.

### What it does today

Page title **Security**, subtitle *"AI Security protection powered by TrendAI"*.
- **Overview** tab: a green banner `Protected by organization policy`, and an `AI Guard` card with `Total log 0` and `Today 0`.
- **AI Guard** tab: *"Messages blocked by **Trend Micro** AI Guard."* Empty state: `No logged events / All messages have passed security checks.`

### UX problems

🟠 **Three confusable brand names in one product**: **TrendIQ** (the digital twin), **TrendAI** (the subtitle here), **Trend Micro** (the actual vendor). Pick one and be consistent.

🟠 **Five of six Governance items are disabled** — including `Sovereignty`, the product's core claim, and `Guardrails` and `PII Detection`, which the sovereignty story depends on.

🟠 **`Protected by organization policy` states a conclusion with no evidence.** Which policy? Set by whom? What does it block?

🟡 Zero counts with no explanation of what would produce a non-zero count.

🟡 Governance contains no audit log, no export, no retention settings, no access review — the artefacts a compliance officer actually needs.

### Redesign

- Rebuild as a **Governance console** with real sections: `Policy` · `Data residency` · `PII & redaction` · `Guardrails` · `Access & roles` · `Audit log` · `Retention`.
- The overview becomes a **posture dashboard**: policy in force, residency distribution of the last 30 days, PII redactions performed, blocked events, connectors carrying data outside the network, and open risks.
- Every claim links to its evidence.
- One vendor name, used consistently.

### 🛠 Build prompt

```
Design a Governance console for an on-premise enterprise AI platform, dark theme.
Audience: a CISO or compliance officer, not an end user.

LEFT NAV (within the console): Posture · Data residency · PII & redaction ·
Guardrails · Access & roles · Audit log · Retention.

POSTURE DASHBOARD
Top row of four stat tiles: Active policy (name + "set by <admin> on <date>"),
Residency split (a horizontal stacked bar: Private % / Public %),
PII redactions (30-day count), Blocked events (30-day count, red if > 0).
Below, three panels:
  "Where your data went" — a horizontal bar per destination
    (in-tenancy GPU / embedding service / external channel), each with a
    residency badge and a byte count.
  "Open risks" — a list of findings, each with a severity chip, a plain
    sentence, and a Fix action. Example rows: "2 connectors can send data
    outside your network", "1 skill points at a sandbox endpoint",
    "PII detection is not enabled for the Procurement space".
  "Recent blocked events" — table with time, rule, user, action taken.
Every number must be clickable through to its evidence.

AUDIT LOG PAGE
Dense table: Timestamp / Actor (user, agent, automation) / Action / System /
Residency tier / Result / Trace ID. Filters for date range, actor type, tier,
and result. An "Export CSV" and an "Export signed report" button.

PII & REDACTION PAGE
Per-space rules: entity types to detect (names, national ID, phone, email,
account numbers), an action per type (Redact / Mask / Block / Allow), and a
live preview showing a sample sentence before and after redaction.

Use ONE vendor name consistently throughout. Do not show a green
"Protected" banner without naming the policy and linking to it.

Style: background #080A0F, cards #12161F, borders rgba(255,255,255,.075),
text #EAEEF5/#98A3B6/#606B80, accent #3B82F6, green #22C55E, amber #F5A524,
red #F43F5E. Data-dense, high information ratio. Self-contained HTML+CSS.
```

---

## 15 · Usage & Budget

### What it is
Consumption tracking and budget control.

### Where it lives
`/usage` — the 🏛 header icon.

### What it does today

**Dashboard tab:** range selector (`Today · 7 days · 30 days · MTD · YTD`), a date range, a **Monthly budget** bar (`$0.0000 / $5000.00 (0%)`, resets 9/1/2026), four stat cards (Total requests `58`, Successful `58`, Total tokens `358.6k`, Total spend `$0.0000`), two time-series charts (Tokens over time, Requests over time), and a **By model** table.

**Requests tab:** 🟡 not a request log — it is **budget increase requests**. *"Need more budget? Send a request to an admin with a justification."*

### The By model table

| Model | Total tokens | Requests |
|---|---|---|
| `azure/Kimi-K2.6` | 333.9k | 33 |
| `bedrock/nvidia.nemotron-super-3-120b` | 24.5k | 1 |
| `azure/text-embedding-3-small` | 176 | 22 |
| `azure/text-embedding-3-large` | 7 | 1 |
| `tts` | 0 | 1 |

### UX problems

🔴 **This table is the evidence contradicting the Private badge.** See §3.

🟠 **`Requests` is an ambiguous tab label** — it reads as a request log. Call it `Budget requests`.

🟠 **Every cost reads `$0.0000`.** Four decimal places of zero on five rows, a $5,000 budget at 0%, and a progress bar with nothing in it. Either pricing isn't wired up or this is a free tier — but the UI insists on displaying precision it doesn't have.

🟠 **No per-user or per-team breakdown**, no per-feature attribution (chat vs automations vs indexing), no forecast against the budget.

🟡 Model identifiers are raw provider strings. `tts` has no provider prefix at all — inconsistent.

🟡 Cost data is shown to every seat.

### Redesign

- Split by audience: an individual sees *their* usage; an admin sees org, team, and per-user.
- **Attribute cost to work**: chat · automations · indexing · agents · voice. That is the question a budget owner asks.
- **Forecast**: "At the current rate you will reach $3,180 of $5,000 by 31 Aug."
- Model rows get human names with the technical identifier in a tooltip — **and a residency badge per row**.
- Hide currency entirely when pricing is not configured; show tokens.
- Rename the second tab `Budget requests` and give it a proper request/approve flow.

### 🛠 Build prompt

```
Design a Usage & Budget dashboard for an enterprise AI platform, dark theme.
Two audiences via a top-right scope switch: "My usage" / "Organisation".

HEADER
Range chips (Today · 7 days · 30 days · Month to date · Year to date) and a
date range label.

BUDGET CARD (full width)
A progress bar with a projection marker: filled portion = spent, a dashed
segment = forecast to month end, and a caption
"At the current rate you'll reach $3,180 of $5,000 by 31 Aug."
Right side: a "Request an increase" secondary button.
If pricing is not configured, hide currency entirely and show token totals
instead — never render "$0.0000".

STAT ROW — four tiles: Requests · Success rate · Tokens · Spend (or Tokens if
no pricing). Each with a sparkline and a period-over-period delta.

TWO CHARTS side by side: tokens over time (stacked prompt vs completion) and
requests over time (successful vs failed).

"WHERE IT WENT" PANEL — a horizontal bar breakdown by WORK TYPE, not by model:
Chat · Automations · Document indexing · Agents · Voice. Each row with tokens,
share, and cost.

BY MODEL TABLE
Columns: Model (human name, e.g. "Kimi K2 — fast everyday", with the technical
identifier in a tooltip) / Residency badge (green "In-tenancy" or amber
"External provider") / Prompt / Completion / Total / Requests / Failures / Cost.
The residency badge column is mandatory — a user must be able to see at a
glance whether a model ran inside or outside their network.

SECOND TAB — "Budget requests" (never just "Requests")
A form (amount, justification, urgency) and a table of past requests with
status chips (Pending / Approved / Declined), approver, and decision date.

Style: background #080A0F, cards #12161F, borders rgba(255,255,255,.075),
text #EAEEF5/#98A3B6/#606B80, accent #3B82F6, green #22C55E, amber #F5A524,
purple #8B5CF6 for the completion series. Self-contained HTML+CSS.
```

---

## 16 · Apps

### What it is
Unclear. One card.

### Where it lives
`/apps` (Apps › All Apps). Siblings *Magna · Company · User · Default* are disabled.

### What it does today
A single card: **Health Care** with a `Demo` pill. Not clickable. Nothing else.

### UX problems

🔴 **An entire top-level nav section containing one non-functional demo card.** 1 of 5 sub-items works, and the one that works does nothing.

🟠 **No definition of "app".** It is not skills, not MCP servers, not agents, not channels — all of which are elsewhere. The concept is undefined for the user.

🟠 **`Workspace` and `Apps` share an identical cube icon** in the nav.

### Redesign

Two honest options:

**A — Remove it.** Fold whatever "apps" means into Capabilities or Connections. One less dead section.

**B — Make it the vertical-solutions surface.** Packaged industry configurations — *Health Care*, *Construction*, *Banking* — each bundling a knowledge space, a set of agents, connectors, and automations, installable in one click. That is a real product, and it matches the `Health Care` card's evident intent.

Choose B only if it will be built this quarter. Otherwise A.

### 🛠 Build prompt

```
Design a "Solutions" gallery for an enterprise AI platform, dark theme.
A solution is a one-click industry bundle: a knowledge space + agents +
connectors + automations, preconfigured.

GALLERY
Cards for: Construction & Infrastructure, Health Care, Banking & Finance,
Government Services, Energy & Utilities, Retail.
Each card: an illustrative icon, name, one sentence of outcome, and a
"what's inside" strip of four small chips — e.g. "6 agents · 4 automations ·
3 connectors · 1 knowledge space". A status pill: Installed / Available / Demo.

SOLUTION DETAIL
Header with the name and an "Install" primary button.
Four tabs: Overview · What's included · Requirements · Preview.
  Overview — the business problems it addresses, as 3 outcome statements
    with a metric each.
  What's included — expandable lists of the agents, automations, connectors,
    and knowledge templates it will create, each with a short description.
  Requirements — which systems must be connected first, each with its current
    status and a Connect link, plus a residency note.
  Preview — 3 screenshots or sample answers showing what a user will get.

INSTALL FLOW (3 steps)
  1. Review what will be created (a checklist the user can uncheck)
  2. Connect required systems (inline, with skip-for-now)
  3. Confirm and install, with a progress list and a success state offering
     "Try your first question" with three suggested prompts.

Style: background #080A0F, cards #12161F, borders rgba(255,255,255,.075),
text #EAEEF5/#98A3B6/#606B80, accent #3B82F6, green #22C55E.
Self-contained HTML+CSS.
```

---

## 17 · Devices — the desktop companion

### What it is
A macOS/Windows app that gives Magna access to local files.

### Where it lives
⚙ → **Devices** → a submenu.

### What it does today
`No devices registered`, then `Download for macOS` and `Download for Windows`.

The `files` skill confirms the purpose: *"any file on their connected remote desk… absolute paths (/Users/…, C:\…), or mentions of 'my desktop', 'my laptop', 'my files'."*

### UX problems

🔴 **A local-filesystem bridge is offered as two bare download links inside a dropdown submenu.** No explanation of what it does, what it can access, whether files are copied or read in place, what leaves the network, or how to revoke it. For an on-prem sovereignty product, an unexplained agent that reads a user's local disk is the highest-stakes item in the entire application.

🟠 No pairing flow, no device list design, no per-device scope, no revoke.

🟠 Buried three levels deep under a gear icon.

### Redesign

- Promote to a **Devices** page with a real value proposition: *"Let Magna work with the files on your laptop without uploading them."*
- **Explicit scope**: the user picks which folders are visible. Default: none.
- **Residency statement**: does file content cross the network to be embedded, or is it read in place? Say it, on the page.
- **Pairing**: download → install → 6-digit code → named device → choose folders → confirm.
- Device list: name, OS, last seen, shared folders, `Pause`, `Revoke access`.
- An access log: which files were read, by which conversation, when.

### 🛠 Build prompt

```
Design a "Devices" page for an on-premise enterprise AI platform, dark theme.
It manages a desktop companion app that lets the assistant read local files.
Trust is the entire design problem — be explicit about scope and data flow.

EMPTY STATE
Headline "Work with the files on your computer".
One sentence: "Magna can read the folders you choose, without you uploading
anything by hand."
Three explainer tiles with icons: "You choose the folders" · "Nothing is copied
unless you ask" · "Revoke access any time".
Two download buttons (macOS, Windows) with version and size, and a
"How pairing works" link.
Below, an amber residency card: "Files read from your computer are processed by
your private cluster. Content is not sent to any external provider."
(Wording must reflect the real architecture.)

PAIRING FLOW (4 steps, stepper)
  1. Download & install — platform buttons with checksum
  2. Enter code — a large 6-digit code display with a countdown
  3. Name this device — text field, prefilled with the hostname
  4. Choose folders — a folder picker list, all UNSELECTED by default, with a
     size and file count per folder, and a warning row for folders that look
     sensitive (Downloads, Desktop, anything with credentials)

DEVICE LIST (once paired)
Rows: device name, OS icon, last seen, a shared-folders count chip, a green
"Connected" or grey "Offline" status, and actions Pause / Edit folders /
Revoke.
Expanding a row reveals the shared folder list and a per-device access log:
timestamp, file path, which conversation requested it, and what was done
(read / written / indexed).

Style: background #080A0F, cards #12161F, borders rgba(255,255,255,.075),
text #EAEEF5/#98A3B6/#606B80, accent #3B82F6, green #22C55E, amber #F5A524,
red #F43F5E for revoke. Self-contained HTML+CSS.
```

---

## 18 · Voice — configured, invisible

### What it is
Text-to-speech and speech-to-text, wired up in settings.

### Where it lives
Settings → Model defaults: `Text-to-speech: azure/tts` · `Speech-to-text: azure/whisper`. The Usage table shows a `tts` row with 1 request.

### UX problems

🔴 **There is no microphone button in the composer and no play button on any answer.** Two models are configured, one has been invoked, and the capability has zero surface area.

### Redesign

- **Microphone in the composer** with live waveform, interim transcript, and edit-before-send.
- **Play on any answer**, with speed control and a "read the whole thread" option.
- **Voice mode** for hands-free use — relevant for a construction/field product where users are on site.
- Arabic + English voice selection, given the market.

### 🛠 Build prompt

```
Add voice to an enterprise AI chat product, dark theme. Design three components.

1. DICTATION IN THE COMPOSER
A microphone button in the composer bar. Active state replaces the input row
with: a live animated waveform, an interim transcript rendering in grey and
firming to white as it's confirmed, an elapsed timer, and two buttons —
"Stop & edit" (primary) and "Cancel". On stop, the transcript lands in the
composer as editable text — it does NOT auto-send.
Include a language chip (English / العربية) and a note when the transcription
model runs outside the private network.

2. PLAYBACK ON AN ANSWER
A "Listen" action in the message action row. Active state shows an inline
player bar under the message: play/pause, a progress scrubber with the
currently-spoken sentence highlighted in the text above, a speed control
(0.75× / 1× / 1.25× / 1.5×), and a voice picker.

3. HANDS-FREE VOICE MODE (full screen)
A centred animated orb that responds to speech amplitude, with three states:
Listening (expanding rings), Thinking (slow pulse), Speaking (waveform).
Live captions beneath the orb showing both sides of the conversation.
Bottom bar: mute, end, and a "Show transcript" toggle that slides the full
thread up over the orb.
Design for a noisy site environment: very large touch targets (min 56px),
extremely high contrast, and a persistent residency badge so the user knows
whether their voice leaves the network.

Style: background #080A0F, surfaces #12161F, text #EAEEF5/#98A3B6,
accent #3B82F6, recording state #F43F5E, green #22C55E for residency.
Self-contained HTML+CSS with CSS animation for the waveform and orb.
```

---

## 19 · Search / Command palette

### What it is
The best-designed thing in the product.

### Where it lives
The unlabelled 🔍 in the header.

### What it does today

Opens a modal with a `Search…` field and two groups:
- **Conversations** — recent threads
- **Search** — Take the tour · Tasks · Projects · Skills · Apps · Tools & MCPs · Channels · Schedules · Heartbeat · Knowledge

### UX problems

🟠 **`⌘K` does not open it.** I tried; nothing happened. The one universal shortcut for this pattern is unbound.

🟠 **Focus is not placed in the input.** I typed a full query after opening it and every keystroke was discarded. Same bug as the composer after closing the palette. This is the most reproducible defect I found.

🟠 **It only searches conversation titles and page names** — not message contents, documents, artifacts, agents, or skills.

🟡 No labelled entry point, no `⌘K` hint anywhere in the UI.

🟡 No actions ("New chat about X", "Create a schedule"), no recents, no keyboard-navigation affordances.

### Redesign

- Bind `⌘K` / `Ctrl+K`. Autofocus the input. Show the shortcut on the trigger.
- Search **everything**: conversations, message contents, documents, artifacts, agents, automations, skills, settings.
- Add an **Actions** group with verbs, and `>` command mode.
- Group results with counts, show source badges (`internal` / `web`), and support `↑↓ ⏎ esc`.

### 🛠 Build prompt

```
Design a universal command palette for an enterprise AI platform, dark theme.
Bound to ⌘K / Ctrl+K, with a visible "Search everything ⌘K" trigger in the
sidebar (not an unlabelled magnifier icon).

MODAL, 640px wide, centred, heavy backdrop blur.
Input row: a search icon, an autofocused field, and an "esc" keycap.
Below, grouped results with counts in each group header:
  Actions — verb-first rows ("New chat about vendors", "Create an automation",
    "Upload to Company knowledge"), each with a ⏎ keycap on the right
  Conversations — title, snippet of the matching message with the query term
    highlighted, relative time, and a residency dot
  Documents — file icon, name, space name, and a green "internal" pill
  Artifacts — type icon, name, source conversation
  Agents & automations — name, purpose, status dot
  Settings & pages — icon, page name, breadcrumb path
The highlighted row is a filled surface with a subtle left accent bar.
Footer bar: "↑↓ navigate · ⏎ open · ⌘⏎ open in new tab · esc close" plus a
right-aligned hint "Type > for commands".

Include three states in the design:
  Empty query — recent conversations, recent documents, and 3 suggested actions
  Typing — live grouped results
  No results — "Nothing matched 'xyz'" plus two fallback actions
    ("Ask Magna about this", "Search company knowledge")

Style: modal #0F1319, borders rgba(255,255,255,.13), text
#EAEEF5/#98A3B6/#606B80, accent #3B82F6, green #22C55E for internal badges,
amber #F5A524 for public. Keycaps as small monospace tags with a hairline
border. Self-contained HTML+CSS.
```

---

## 20 · Onboarding & Help

### What it is
A 7-step tour, plus an in-product help skill.

### Where it lives
The ⓘ header icon. Also `magna-guided-help` (a skill), and "Take the tour" in the palette.

### What it does today

A modal: *"WELCOME TO MAGNA — This 2-minute tour shows you the basics. You can take it again any time from **this Compass button**."* with `1 / 7`, `Skip`, `Next`.

`magna-guided-help` handles *"what can this platform do?"*, *"how do I set up Slack?"*, *"where do I connect my email?"* in plain language, pointing at UI locations.

### What's good
Having a help *skill* — where the assistant explains its own product — is smart and rare.

### UX problems

🟠 **The tour calls the ⓘ icon a "Compass button".** The icon is an information glyph. The copy references an icon that isn't there.

🟠 **The tour took several seconds to become visible** — it rendered at near-zero opacity on first paint before fading in.

🟠 **A 7-step tour is a poor fit for a product this deep.** Seven modals cannot cover skills, agents, automations, knowledge, residency, canvases, and devices — and a tour teaches nothing that sticks.

🟠 **`magna-guided-help` is invisible.** No "Ask about Magna" affordance anywhere.

🟡 No first-run checklist, no progress, no contextual empty-state guidance.

### Redesign

- Replace the tour with a **persistent "Get started" checklist**: connect a system · upload a document · ask your first question about company data · create an automation · invite a teammate. Progress persists, dismissible, resumable.
- **Contextual coaching** in empty states instead of an upfront modal.
- Give `magna-guided-help` a front door: a `?` in the sidebar opening a help composer prefilled with *"How do I…"*.
- Fix the icon/copy mismatch and the render flash.

### 🛠 Build prompt

```
Design onboarding for a deep enterprise AI platform, dark theme.
Replace a 7-step modal tour with a persistent, resumable setup experience.

GET STARTED PANEL
A collapsible card pinned to the bottom of the left sidebar showing
"Setup · 2 of 5" with a thin progress bar. Expanding it reveals a checklist:
  1. Connect a system you already use — with 3 logo chips and a Connect link
  2. Add your first documents — with an upload affordance
  3. Ask a question about your own data — with a suggested prompt
  4. Automate something you do weekly — with a "See examples" link
  5. Invite a teammate
Each row: a state icon (done / current / locked), a title, a one-line "why this
matters", and an action button. Completed rows collapse to a single line with a
check. A "Hide setup" link that moves it into the help menu rather than
deleting it.

CONTEXTUAL EMPTY STATES (design 3 examples)
For Agents, Automations, and Knowledge — each with an illustrative icon,
a headline stating the value, two lines of explanation, ONE primary action,
and three example cards showing what a good first one looks like.
Never "Nothing here yet".

HELP ENTRY POINT
A "?" button in the sidebar footer opening a small panel with:
a prefilled composer ("How do I…"), four common questions as chips, and a
"Browse all capabilities" link. Make clear the assistant answers questions
about the product itself.

FIRST-ANSWER COACHMARK
After a user's very first answer, one small non-blocking tooltip pointing at the
citations block: "Every answer shows where it came from — and whether it used
your company data or the web." Dismissible, shown once.

Style: background #080A0F, cards #12161F, borders rgba(255,255,255,.075),
text #EAEEF5/#98A3B6/#606B80, accent #3B82F6, green #22C55E for completed
steps. Self-contained HTML+CSS.
```

---

## 21 · Appearance & the Companion

### What it is
Theming, and a 3D animal/robot mascot.

### Where it lives
⚙ → Theme & Display → Display Settings. Companion: 🔔 bell.

### What it does today

**Theme & Display:** Theme `North Star Vibe` (the only one) · Mode `Dark` / `Light` / ~~`Rainbow`~~ · Display Settings.

**Display Settings panel:** Interface scale (Compact ↔ Large) · Dark/Light · **Background overlay %** · **Background animation** (None, Color Halo, Particle Field, Aurora, Grid Pulse, Orbit Rings, Radial Breathe) · **Background image** (wallpaper picker) · **Vignette %** · **Film grain %** · **Background blur px** · **Wallpaper zoom %** · **Accent colour** (8 swatches) · raw **Hue / Saturation / Lightness** sliders displaying `hsl(210, 67%, 47%)`.

**Companion:** a 3D robot with 11 animal alternatives (Fox, Wolf, Husky, Shiba Inu, Alpaca, Horse, White Horse, Cow, Bull, Deer, Stag) and a `Hide companion` button — sharing a popover with Notifications.

### UX problems

🔴 **The companion overlaps the send button and steals its clicks.**

🟠 **Roughly 14 appearance controls exist while the product lacks a copy button.** Film grain, vignette, wallpaper zoom and HSL sliders represent significant engineering invested in the least valuable surface.

🟠 **The defaults are the problem**: 50% overlay + a photographic wallpaper is what makes body text hard to read. Every one of these sliders is a workaround for a bad default.

🟠 **`hsl(210, 67%, 47%)` is raw CSS shown to an end user.**

🟡 Companion and Notifications share one popover — unrelated concepts.

🟡 One theme named `North Star Vibe`; `Rainbow` mode disabled.

### Redesign

- **Default to a flat, legible surface.** Wallpaper becomes an opt-in "Personalise" toggle, off.
- **Collapse ~14 controls to four**: Theme (Dark / Light / System), Accent (swatches only), Density (Compact / Comfortable), Background (None / Subtle gradient / Wallpaper). Everything else goes behind `Advanced` or is removed.
- **Companion off by default**, its own settings row, anchored so it can never overlap a control, with an explicit note that it is decorative.
- Separate Notifications from Companion.

### 🛠 Build prompt

```
Design an "Appearance" settings panel for an enterprise AI platform, dark theme.
The current product ships ~14 cosmetic controls (film grain, vignette, wallpaper
zoom, background animation, raw HSL sliders) and a photographic wallpaper at 50%
overlay behind body text. Fix the defaults, then simplify.

MAIN PANEL — exactly four controls, each with a live preview thumbnail:
  1. Theme — segmented: Dark / Light / Match system
  2. Accent colour — 8 swatches only. No hue, saturation, or lightness sliders,
     and never display a raw CSS colour value.
  3. Density — segmented: Compact / Comfortable / Spacious, with a note about
     which suits long reading sessions.
  4. Background — segmented: None (recommended) / Subtle gradient / Wallpaper.
     Selecting Wallpaper reveals a small image picker AND a contrast warning
     if the chosen combination would drop body text below WCAG AA, with a
     "Fix contrast" one-click action.

A LIVE PREVIEW card, sticky on the right, rendering a realistic sample chat
message so the effect of every change is visible on actual body text — not on
an abstract swatch.

ADVANCED (collapsed by default, clearly marked "Advanced")
Interface scale, background animation, blur, vignette, grain. Each with a
"Reset all advanced settings" link.

COMPANION
Its own row, separate from notifications: a toggle labelled "Show companion",
OFF by default, with the description "A decorative 3D character. It has no
effect on answers." When on, a character picker and a POSITION control with
four corner options — and a note that it will never overlap the composer.

Style: background #080A0F, cards #12161F, borders rgba(255,255,255,.075),
text #EAEEF5/#98A3B6/#606B80, accent #3B82F6, amber #F5A524 for the contrast
warning. Self-contained HTML+CSS.
```

---

## 22 · Notifications

### What it is
Alerts, sharing a popover with the companion picker.

### Where it lives
🔔 header icon.

### What it does today
A `Notifications` header with a refresh icon and `Mark all read`, then `Nothing new.`, then — in the same popover — a `Companion` section with 12 character tiles and `Hide companion`.

### UX problems

🟠 **Two unrelated features in one popover.** A user opening notifications is shown a menagerie.

🟠 **`Notify user` is a core built-in tool** and automations have a "notifies you instead" behaviour, yet the notification surface has no design for what those look like.

🟡 No categories, no deep links, no preferences, no history.

### Redesign

- Separate the companion out entirely.
- Design real notification types: **automation finished** (with a result summary and "Open"), **approval needed** (with Allow/Deny inline), **agent asked a question**, **task request from a colleague's agent**, **budget threshold**, **connector failed**.
- Group by Today / Earlier; add filters and per-type delivery preferences (in-app, email, Telegram/Teams).

### 🛠 Build prompt

```
Design a notification centre for an enterprise AI platform, dark theme.
It must NOT contain any appearance or mascot settings.

PANEL (400px, anchored to a bell icon with an unread count badge)
Header: "Notifications", a filter icon, and "Mark all read".
Grouped: Today / Yesterday / Earlier.
Design SIX distinct notification types, each visually differentiated:
  1. Automation finished — icon, automation name, a one-line result
     ("3 incidents flagged"), timestamp, and an "Open result" button
  2. Approval needed — amber left border, the action described
     ("Send email to 4 recipients"), and INLINE "Allow" / "Deny" buttons
  3. Agent asked a question — the question quoted, with a "Reply" affordance
     that opens the thread
  4. Task request from a colleague — requester avatar + name, the ask, and
     Accept / Decline
  5. Budget threshold — a small progress bar and "80% of your monthly budget"
  6. Connector failed — red left border, connector logo, error summary, and
     a "Reconnect" button
Unread items carry a left accent bar and a slightly raised surface.
Include a "No new notifications" empty state that lists what will appear here.

PREFERENCES PANEL (secondary screen)
A table: notification type (rows) × delivery channel (columns: In-app, Email,
Telegram, Teams) with checkboxes, plus a quiet-hours row with a time range and
timezone.

Style: background #0F1319, borders rgba(255,255,255,.075), text
#EAEEF5/#98A3B6/#606B80, accent #3B82F6, green #22C55E, amber #F5A524,
red #F43F5E. Self-contained HTML+CSS.
```

---

## 23 · The Agentic Twin (AT / TrendIQ)

### What it is
A 16-source enterprise context graph — the most differentiated capability in the platform.

### Where it lives
🔴 **A ~12px unlabelled vertical tab glued to the right screen edge**, reading `ACTIVE AT TrendIQ` in rotated text.

### What it does today

Expands into a panel showing:
- `SELECTED AT · TrendIQ` with an `active` status and a dropdown
- `7/16 connected · 6 partial` and a `Sovereign Mode` badge
- A radial topology diagram with nodes: Structural, Workflows, Behavioral, Guardrails, Observability, Dynamics, Enterprise Apps, Data Sources, Intent
- Four tabs with coverage counts: **Structural 3/5** · **Behavioral 1/4** · **Dynamics 1/3** · **Intent 2**
- Under Structural: `Org Chart & Units` ✓ · `Process Maps` ✓ · `Data Flow Registry` ⚠ · `Enterprise Apps` ✓ · `Data Sources` ⚠

### UX problems

🔴 **The most valuable, most differentiated, most saleable capability in the product is hidden behind a 12px tab with rotated text and an unexpanded acronym.** "AT" is never defined anywhere in the UI. `Agentic Twins` appears in the nav — permanently disabled.

🟠 **No connection to answers.** Nothing in the chat indicates which of the 16 sources informed a response, or which relevant one was missing.

🟠 **`7/16 connected · 6 partial` is the single best expansion metric in the product** and it is invisible from every other screen.

🟠 **`Partial` is undefined.** What is partially connected? What is missing? What would completing it change?

### Redesign

- Promote to a **context rail** in chat, and a full **Enterprise context** page.
- **Per-answer grounding chips**: which sources fed this answer, in green — and, in amber, a relevant source that is *not* connected.
- **Honest confidence**: "Confidence capped at medium — I could not see the site telemetry, so progress is inferred from a 6-day-old plan."
- **Every gap becomes a CTA** phrased as answer quality, not licensing: *"Connecting these 2 sources would move schedule answers from planned to measured."*
- Expand the acronym. Ship the coverage number on the home screen.

### 🛠 Build prompt

```
Design an "Enterprise context" system for an on-premise AI platform, dark theme.
It surfaces a 16-source organisational context graph (org chart, process maps,
enterprise apps, data flows, behavioural logs, objectives) that currently hides
behind a 12px screen-edge tab.

COMPONENT 1 — CONTEXT RAIL (326px, right side of the chat)
Header: an icon, "Enterprise context", and a source-name pill.
A three-segment coverage meter (connected / partial / missing) with a legend
reading "7 connected · 6 partial · 3 missing".
Grouped source lists: Structural (3/5) · Behavioural (1/4) · Dynamics & intent
(3/7). Each row: a status dot (green check / amber warning / grey dash),
the source name, and a green "used" tag when it contributed to the current
answer. Rows that were used get a subtle green-bordered surface.
Bottom: an amber "gaps" card — "Two gaps are limiting this answer", one
sentence on what connecting them would change, and a full-width primary
"Connect these 2 sources" button.
Footer: a lock icon and "Sovereign mode — the twin never leaves your network".

COMPONENT 2 — IN-ANSWER GROUNDING STRIP
A bordered strip above the answer body labelled "GROUNDED IN", containing green
chips for each source used (Org chart, Process maps, Primavera P6,
Change-order log) and ONE amber chip for a relevant source that is not
connected ("Site IoT feed — not connected").

COMPONENT 3 — CONFIDENCE CALLOUT
An amber-bordered inline note at the end of an answer:
"Confidence is capped at medium. I could not see the site IoT feed or the daily
labour returns, so actual progress is inferred from plan updates that are 6 days
old. Connecting those two would let me answer from measured reality."

COMPONENT 4 — FULL CONTEXT PAGE
A radial topology diagram of the 16 sources with connected/partial/missing
states, a coverage scorecard, and a table listing each source with owner,
last sync, record count, and a Connect / Fix action. Include a
"What this unlocks" column stating, per source, the kind of question it makes
answerable.

Style: background #080A0F, rail #0D1119, cards #12161F, borders
rgba(255,255,255,.075), text #EAEEF5/#98A3B6/#606B80, accent #3B82F6,
green #22C55E, amber #F5A524. Self-contained HTML+CSS.
```

---

## 24 · Cross-cutting issues

| # | Issue | Severity | Evidence |
|---|---|---|---|
| X1 | **Residency claim unsubstantiated** | 🔴 | `Private` badge shown while Usage reports `azure/*` and `bedrock/*` routing |
| X2 | **Internal infrastructure exposed** | 🔴 | `*.magna-system.svc.cluster.local` on every MCP card; "the pod runs a heartbeat tick"; Langfuse session IDs; `FINAL RETURN` |
| X3 | **Non-production artefacts in production UI** | 🔴 | `salesforce-uat-api` → `magnaai--uat.sandbox.my.salesforce.com`; `elon-musk-perspective-en (failed to parse SKILL.md)` |
| X4 | **Focus is dropped after modals** | 🟠 | Typed a full sentence into the composer after closing the palette, and again into the palette itself — all keystrokes discarded. Reproducible |
| X5 | **`⌘K` unbound** | 🟠 | The palette's only trigger is an unlabelled magnifier |
| X6 | **404 page breaks the design system** | 🔴 | White page, grey Helvetica, on a black product |
| X7 | **Storage formats are the UI** | 🟠 | `SOUL.md`, `STYLE.md`, `HEARTBEAT.md`, `TASK_REQUEST.md`, `__inherit__`, `memories:context/…`, `github/delete_repo.py` |
| X8 | **Vocabulary collisions** | 🟠 | Task/agent/subagent/custom role · TrendIQ/TrendAI/Trend Micro · Skills in two places · "Requests" meaning two things |
| X9 | **13 of 26 nav destinations disabled** | 🔴 | Including the section highlighted by default |
| X10 | **Icon collisions** | 🟡 | Workspace and Apps share the same cube; account menu behind a gear; ⓘ described as a "Compass" |
| X11 | **Route naming inconsistent** | 🟡 | `/skill` vs `/apps`; `/rag`, `/tool-mcp` are implementation names; `/project`, `/artifact`, `/knowledge` 404 |
| X12 | **Empty states teach nothing** | 🟠 | "Nothing here yet" on Agents, Schedules, Artifacts, Knowledge, Projects |
| X13 | **Layout instability** | 🟡 | Nav flyouts shove the chat column sideways; the tour rendered at near-zero opacity before fading in |
| X14 | **Capability/UI mismatch** | 🟠 | Voice models, agent-to-agent messaging, document/slide canvases, and a desktop file bridge all exist with little or no UI |

---

## 25 · Information architecture — proposed

Replace 7 sections / 26 items with **three surfaces**.

```
WORK  (default — 95% of seats)
  Chat            threads, projects, canvases
  Automations     schedules + watches, run history
  Knowledge       spaces, documents, ask
  Files           artifacts, uploads, devices

BUILD  (opt-in per user)
  Agents          templates, editor, test
  Capabilities    skills gallery + registry
  Connections     connectors, MCP servers, channels, delegation network

GOVERN  (admins & compliance only — separate console)
  Posture · Residency · PII & redaction · Guardrails ·
  Access & roles · Audit log · Usage & budget · Traces
```

**Moves out of the user's way:**

| From | To |
|---|---|
| Composer "Show traces" | Govern › Traces |
| 18-skill checkbox list | Build › Capabilities (auto by default) |
| Raw memory keys & scores | Work › "What Magna remembers" |
| Hue / saturation / film grain | Appearance › Advanced |
| Usage & cost | Govern (admins), with a personal view in Work |
| "Upcoming" nav section | A roadmap link in Help |

---

## 26 · Design tokens

```css
/* surfaces */
--bg:        #080A0F;   --bg-2:    #0D1119;
--surface:   #12161F;   --surface-2:#171C27;  --surface-3:#1E2432;

/* lines */
--line:   rgba(255,255,255,.075);
--line-2: rgba(255,255,255,.13);

/* text */
--tx:   #EAEEF5;   /* primary   */
--tx-2: #98A3B6;   /* secondary */
--tx-3: #606B80;   /* tertiary  */

/* semantic */
--blue:   #3B82F6;  /* action, selection            */
--green:  #22C55E;  /* private / in-tenancy / used  */
--amber:  #F5A524;  /* public / partial / warning   */
--rose:   #F43F5E;  /* destructive / failure        */
--violet: #8B5CF6;  /* completion series in charts  */

/* geometry */
--r: 10px;  --r-lg: 16px;  --r-pill: 999px;

/* type */
font-family: Inter, -apple-system, "Segoe UI", Roboto, sans-serif;
--mono: "JetBrains Mono", ui-monospace, Menlo, monospace;  /* IDs & metadata only */
```

**Colour law:** green always means *stayed inside your network*. Amber always means *left it, or is incomplete*. Never use them decoratively.

---

## 27 · Sequencing

### Week 1 — no design debate required
- Companion off by default
- Prompt chips pre-fill instead of send
- Trace panel collapsed by default
- Copy button on every answer
- Fix focus after modal close; bind `⌘K`
- Style the 404 page
- Remove the `Upcoming` nav section
- Remove `elon-musk-perspective-en` and hide `salesforce-uat-api` from non-admins
- Hide `*.svc.cluster.local` behind an admin disclosure
- Replace "the pod runs a heartbeat tick" and `__inherit__`

### Weeks 2–6 — the shell
- Permanent conversation sidebar
- Flat default surface, wallpaper opt-in, Appearance cut to four controls
- Citations with web/internal split
- Agent template gallery as the empty state, one noun throughout
- Merge Heartbeat + Schedules into Automations
- Launchpad home screen replacing the hero

### Quarter — the differentiators
- **Resolve the residency claim** (§3) — highest priority of everything in this document
- Sovereignty guardrail + residency receipt
- Context rail (Agentic Twin) surfaced
- Work / Build / Govern split
- Canvas entry points + Create menu
- API-to-skill wizard as the headline demo
- Knowledge spaces with permissions
- Voice surfaces
- Devices pairing flow

---

## 28 · Master prompt — full-product regeneration

Use this when you want one model to hold the whole system in mind.

```
You are designing MagnaVERSE, an on-premise enterprise AI platform for the Saudi
market. It competes with ChatGPT and Claude on familiarity, and wins on data
sovereignty: inference runs inside the customer's own network.

AUDIENCES
  Operators (95% of seats) — procurement leads, delivery managers, HSE officers.
    They want answers grounded in company systems. They are not technical.
  Builders — platform engineers configuring agents, skills, and connectors.
  Governance — CISOs and compliance officers who must prove where data went.

STRUCTURE — three surfaces, never one menu:
  WORK    Chat · Automations · Knowledge · Files
  BUILD   Agents · Capabilities · Connections
  GOVERN  Posture · Residency · PII · Guardrails · Access · Audit · Usage · Traces

NON-NEGOTIABLE PRINCIPLES
  1. Never show internal identifiers to operators — no cluster hostnames, no
     filenames as UI, no model-facing instruction text, no relevance scores,
     no trace IDs, no raw CSS values.
  2. Every answer states where it ran and what it touched. Green means the data
     stayed inside the network; amber means it left. These colours have no
     decorative use.
  3. Nothing sends, publishes, deletes, or pays without an explicit approval
     step. Approval prompts state the action, the system, and the data involved.
  4. Body text never sits on a photograph. Legibility is not a preference.
  5. Every empty state teaches: one sentence of value, one primary action, and
     three concrete examples. Never "Nothing here yet".
  6. Roadmap features never appear in navigation.
  7. One word per concept. An agent is an agent everywhere.

VISUAL SYSTEM
  Background #080A0F · surfaces #12161F / #171C27 · borders
  rgba(255,255,255,.075) · text #EAEEF5 / #98A3B6 / #606B80 · accent #3B82F6 ·
  green #22C55E · amber #F5A524 · red #F43F5E · violet #8B5CF6.
  Inter-style sans throughout; monospace reserved for identifiers and metadata.
  Radii 10px / 16px / pill. Dense but calm — high information ratio, generous
  line-height in reading columns (1.6), tight in tables.
  Bilingual-ready: every layout must survive an RTL flip and Arabic text.

Design [SCREEN NAME] following all of the above. Output self-contained
HTML + CSS at 1440×900. No frameworks, no external assets, no emoji.
```

---

*Companion document: `MagnaVERSE-UX-Audit.md` (prioritised issue list) and five UI concept mockups (`01-core-chat` · `02-sovereignty` · `03-launchpad` · `04-context-rail` · `05-two-modes`), supplied as PNG and editable HTML.*
