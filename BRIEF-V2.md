# Brief v2 — full product flow, email MCP, and a sixth design

This supersedes nothing. [BRIEF.md](BRIEF.md) (fix-list, tokens, rendering) and
[BRIEF-ADDENDUM.md](BRIEF-ADDENDUM.md) (real logo, responsive, animation) still apply in full.
This adds the **complete product flow**, the **email MCP**, and a **sixth design direction**.

The authoritative functional reference is `MagnaVERSEFullFunctionalUXSpec.md` — 23 capabilities,
each with what-it-is / what-it-does-today / what's-wrong / what-it-should-become. **Read the
sections relevant to your app before building.**

---

## 1. Every app becomes a full product, not a single screen

Right now each app opens straight into a chat. The client wants to walk a manager through the
whole thing. So each app must ship a **complete flow with dummy data**, driven entirely
client-side — no backend, no network.

### 1.1 The flow

```
Login  →  (Register / SSO)  →  Workspace picker  →  First-run  →  App
                                                                   ├─ Chat
                                                                   ├─ Connections (incl. Email MCP)
                                                                   ├─ Agents
                                                                   ├─ Tasks & schedules
                                                                   ├─ Knowledge
                                                                   └─ Settings
```

**Login screen** — the first thing shown on load.
- Split layout: brand side (the animated Magna mark, the sovereignty promise, a line like
  "Runs on Magna GPUs in Riyadh. Your data never leaves your network.") and a form side.
- Email + password fields, a "Sign in" button, "Continue with Magna SSO", and a
  "Create an account" link. Show a `Private · Riyadh DC-1` badge.
- **Pre-fill the demo credentials visibly** (`ahmad.farahat@magna.ai` / `••••••••`) with a small
  "Demo credentials filled — press Sign in" note, so a manager can get in without typing.
- Validate: empty email shows a real inline error. Wrong password shows a real error. Any
  password ≥4 chars signs in. Show a brief signing-in state on the animated mark.
- **Never** collect or transmit real credentials — this is a prototype with fake local state.
- Register flow: name, email, password, org — then straight into the workspace picker.

**Workspace picker** — pick between `Magna KSA · Production` (Private tier, Riyadh DC-1) and
`Magna Sandbox` (Public tier allowed). The choice sets the app's default sovereignty tier, and
picking the sandbox must visibly change the tier state in the app.

**Sign out** from the account menu returns to the login screen. Session state persists in
`localStorage` so a reload keeps you signed in — with a "Sign out" that genuinely clears it.

### 1.2 Real navigation between real pages

The nav in the sidebar must actually route (client-side view switching, no page loads). Every
destination you show must work — that is fix A5. Minimum set:

| View | Must contain |
|---|---|
| **Chat** | The transcript you already built |
| **Connections** | Tabs: Knowledge · Skills · Tools & MCP · Channels. The MCP tab is where email gets connected (§2) |
| **Agents** | List of 3–4 agents with name, purpose, model, tools, schedule, last run + a create flow |
| **Tasks & schedules** | Scheduled runs with cron, last result, next run, enable/disable toggles |
| **Knowledge** | Document list with source, size, chunk count, last indexed, and an upload affordance |
| **Settings** | The modal you already built, reachable from here too |

Empty states everywhere must explain the thing and offer one concrete action (fix A8).

### 1.3 Dummy data

Realistic and internally consistent. Use the §1 facts from BRIEF.md plus:

- 6–8 conversations across Today / Yesterday / Last week
- 3 projects (Riyadh DC-2 Expansion, Q3 Procurement, HSE Compliance 2026)
- 4 agents (e.g. *HSE Digest* daily 06:00; *PO Slippage Watch* hourly; *Jira Intake Triage*;
  *Board Pack Drafter* manual)
- 3–5 schedules with realistic cron and last-run outcomes
- 8–12 knowledge documents with sizes and index dates
- 6 connectors: SAP S/4HANA, Primavera P6, Jira, Confluence, Company Knowledge, **Magna Mail**

Never `Item 1`, never lorem, never `foo@bar.com`.

---

## 2. The Email MCP — a required, fully-working flow

This is the client's headline new capability: **a user registers, connects their mail through an
MCP server, and can then read and send mail from inside MagnaVERSE.** Build it end to end.

### 2.1 Connect it

In **Connections › Tools & MCP**, list the MCP servers with plain-language descriptions and a
status. `Magna Mail` starts **not connected**, with a `Connect` button.

Clicking Connect opens a step-through:

1. **Choose provider** — Magna Mail (Exchange, on-prem) · Microsoft 365 · Google Workspace · IMAP.
   Mark the non-on-prem ones with an amber "traffic leaves your network" note.
2. **Account** — email address and display name. Never ask for a password: show
   "You'll approve this in your mail provider's own sign-in window" and a
   `Authorise in provider →` button that simulates the round-trip with a spinner.
   **Do not build a fake password field for a mail account** — a prototype must not train people
   to type real credentials into a mockup.
3. **Scopes** — explicit checkboxes: *Read mail* · *Send mail as you* · *Read contacts* ·
   *Read calendar*. Default: read on, send **off** — the user must opt in to send.
4. **Residency** — state where mail is indexed and whether any of it leaves the network. For
   Magna Mail (on-prem) say "0 bytes leave your network".
5. **Done** — the server flips to `Connected`, shows the granted scopes, the account, and
   a "Last synced" time. Add a `Disconnect` that genuinely reverts it to not-connected.

The connected state must persist in `localStorage` and be reflected everywhere — the `/` slash
menu gains the mail tools only after connection.

### 2.2 Use it — read

Add a **Mail** view (or a panel) showing an inbox of 6–8 realistic messages relevant to this
user's work — PO slippage from a supplier, an HSE incident notice, a Jira digest, a contract
amendment from legal, a meeting invite. Each with sender, subject, preview, time, unread state.
Clicking one opens it in full with a `Summarise with Magna` and `Draft a reply` action.

Reading a message must be reachable **from chat too**: asking "what's in my inbox about Package 4?"
returns an answer that visibly used the `magna-mail` MCP tool — show it in the reasoning line and
in the tool list.

### 2.3 Use it — send

**Sending is the dangerous action, so it gets a real confirmation.** This is the pattern to model:

- The assistant drafts the reply **into an editable composer** — subject, to, cc, body. It never
  sends on its own. This is the same principle as fix A3.
- A **send confirmation** shows exactly what will go out and to whom, with `Edit`, `Cancel` and
  `Send`. If the mail MCP's *Send mail as you* scope was never granted, the Send button is
  disabled with a link to grant it.
- After sending, show a success state and log it — the message appears in a Sent list, and the
  action appears in the tool/audit trail with a timestamp.
- If the thread is in the **Public** tier, sending mail that quotes internal documents must trip
  the guardrail (fix A6) naming what would leave the network.

### 2.4 Tool approval

Mail tools are the natural place to demonstrate §13 of the functional spec (permissions & tool
approval). Show an approval prompt the first time a mail tool runs in a thread —
*"Magna wants to run `magna-mail.search` · read-only · runs on-prem"* — with `Allow once`,
`Allow for this thread`, `Always allow`, `Deny`. Remember the choice.

---

## 3. Capability depth — pull from the functional spec

Beyond mail, each app should make **agents** and **MCP** feel real, because those are what the
client called out. From `MagnaVERSEFullFunctionalUXSpec.md`:

- **§5 Tools & MCPs** — servers listed with what each tool actually does, transport, whether it
  runs local, last error, and a test-connection action.
- **§6 Agents** — an agent is a named role with a model, a toolset, a knowledge scope and a
  trigger. Show its runs, its last output, and let the user run one on demand. Creating one should
  be a short guided flow, not a wall of fields.
- **§7 Tasks — Heartbeat & Schedules** — cron with a plain-English preview
  ("every weekday at 06:00"), last run, next run, and the actual result.
- **§13 Permissions** — the approval prompt above.
- **§19 Command palette** — ⌘K reaches every view, document, conversation and action.

You do not need to build all 23 capabilities. Build Chat, Connections (with mail), Agents,
Tasks and Knowledge properly, and make the rest reachable and honest.

---

## 4. The six apps

Apps 1–5 keep their existing identity and layout — **you are extending them with the flow above,
not restarting them.** Keep every fix already in place.

| File | Name | Keep its identity |
|---|---|---|
| `app-1-chatgpt.html` | Familiar | ChatGPT idiom, low chrome |
| `app-2-claude.html` | Considered | Warm paper, artifact panel |
| `app-3-sovereign.html` | Provable | Instrument panel, residency receipts |
| `app-4-launchpad.html` | Ready | Launchpad home, `/` and ⌘K |
| `app-5-twin.html` | Grounded | Context rail, provenance |
| `app-6-horizon.html` | **Horizon** | **New — see below** |

### `app-6-horizon.html` — "Horizon"

The client asked for a **sixth, futuristic direction that is not like ChatGPT and not like
Claude — and that is still genuinely easy to use.** Those two goals fight each other, and
resolving that tension is the design problem. Futuristic must not mean harder.

Direction — build a **spatial, canvas-first workspace** instead of a scrolling transcript:

- Work happens on a **zoomable canvas of cards**, not a linear chat. A question spawns a card;
  its answer, sources, artifacts and follow-ups are connected cards you can see the relationships
  between. Threads become visible structure instead of scroll history.
- A **single omni-input** is the only thing on screen at rest — centred, large, with the animated
  Magna mark. Type, and the canvas assembles around it.
- **Ambient system state** rendered as live telemetry: GPU cluster load, residency, connected
  systems, running agents — a quiet always-on strip that makes the on-prem hardware felt.
- **Depth and light instead of borders**: layered translucent surfaces, a soft glow accent, subtle
  parallax. Motion that means something — cards ease into place along their connection lines.
- Keep it easy: a persistent "list view" toggle that flattens the canvas back into a normal
  transcript for anyone who wants one, plus the same ⌘K and `/` affordances as the others.

Constraints that still apply: light **and** dark, responsive to 320 px (on mobile the canvas
becomes a vertical card stack — do not ship a pan-and-zoom canvas as the only mobile experience),
44 px targets, no CDN, real rendering of maths/code/diagrams, and the full flow from §1 including
the email MCP.

Do not use the AI-generated defaults: no purple-to-blue gradient hero, no acid-green-on-black,
no glassmorphism-by-default. Earn the futurism from the subject — sovereign compute, telemetry,
data residency, physical GPUs in a building in Riyadh.

---

## 5. Deliverable

One self-contained HTML file at your assigned path. Then report:

1. **The flow** — confirm login → workspace → app works, and how to sign out.
2. **Email MCP** — the connect steps, read, draft, the send confirmation, scope enforcement, and
   the tool-approval prompt. State what is genuinely wired vs. represented.
3. **Views** — which nav destinations you built and what is in each.
4. **Kept** — confirm the round-one and round-two work survived: fix-list, real animated mark,
   mark-as-thinking-indicator, light/dark, responsive to 320 px, rendered maths/code/diagrams.
5. **Anything you'd flag.**
