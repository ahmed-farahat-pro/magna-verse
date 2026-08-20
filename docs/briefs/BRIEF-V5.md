# Brief v5 — build-your-own MCP, skills from GitHub, richer agents, many connectors

Adds to BRIEF.md, BRIEF-ADDENDUM.md, BRIEF-V2.md, BRIEF-V3.md and BRIEF-V4.md. All still apply.

The point of this round: **a developer will pick these demos up and make them real.** So every
flow must show the actual fields, the actual config, and the actual failure states — not a
happy-path illusion. Where a real implementation would need a value, show the field.

---

## 1. Let the user create an MCP server themselves

Today the demos let you connect servers from a catalogue. Now add the **custom server** path,
modelled on how Claude Desktop and Claude.ai let people add their own MCP servers.

`Connections › Tools & MCP › + Add server` offers three routes. Route 3 is the new work.

### Route 3 — "Connect your own server"

A stepper. Step 1 asks **how the server runs**, because everything else depends on it:

| Transport | Fields to collect |
|---|---|
| **Local process** (stdio) | Command (e.g. `npx`), Arguments (e.g. `-y @magna/jira-mcp`), Working directory, Environment variables |
| **Remote — HTTP/SSE** | Server URL (`https://mcp.magna.internal/jira`), Auth: none / bearer token / OAuth 2.1, Custom headers |

Then:

2. **Identity** — display name, one-line description, an icon/colour, and which workspace it belongs to.
3. **Secrets** — environment variables and tokens as key/value rows you can add and remove.
   Values are masked with a reveal toggle, and a note says they are stored in the workspace
   secret store and never sent to the model. **These are demo fields — do not persist a real
   secret anywhere, and say so in the UI.**
4. **Test connection** — a visible handshake: `initialize` → protocol version → `tools/list`.
   On success, show **every discovered tool** with its name, description and input schema, each
   with an on/off toggle so the user can expose only what they want. On failure show a readable
   error (`ECONNREFUSED`, `401 Unauthorized`, `no tools returned`, `protocol version mismatch`)
   with what to check.
5. **Permissions** — read-only tools on by default; anything that writes, sends or deletes is off
   and must be ticked deliberately, each labelled in plain language.
6. **Done** — the server appears in the list, its tools appear in `/`, and the connection count
   increments.

### Show the config a developer would actually write

On the final step and on every server's detail view, include a **"Config" disclosure** showing the
equivalent JSON, with a copy button:

```json
{
  "mcpServers": {
    "magna-jira": {
      "command": "npx",
      "args": ["-y", "@magna/jira-mcp"],
      "env": { "JIRA_BASE_URL": "https://magna.atlassian.net", "JIRA_TOKEN": "••••••" }
    }
  }
}
```

and the remote equivalent (`"url"`, `"headers"`). This is the single most useful thing in the
whole demo for the engineer who has to build it — make it accurate and copyable.

---

## 2. Skills: import from a GitHub repository

`Connections › Skills › + Add skill` currently offers catalogue / template / import. Extend the
import route:

- **From a GitHub repo** — paste a repo URL (`https://github.com/magna-ai/magna-skills`), optionally
  a branch and a subfolder. Show a simulated fetch, then **list the skills found in that repo** as
  selectable rows: name, id, description, path, last commit. Tick the ones to import.
- Show a **preview of the parsed skill** before importing: its frontmatter (name, description,
  required connections, trigger) and the first lines of its instructions.
- **Validate every one.** A malformed skill must fail readably — name the file, the line and the
  problem — and must never enter the catalogue. Keep the existing
  `elon-musk-perspective-en (failed to parse SKILL…)` case as the worked example of what today's
  build gets wrong.
- After import, each skill card shows a **source badge**: `Catalogue`, `GitHub`, or `Custom`, and
  GitHub-sourced skills link back to the repo and show the commit they came from, plus a
  **Check for updates** action.
- Also keep: paste a definition directly, and upload a file.

---

## 3. Agents — deeper, and with ideas worth stealing

The agent creation flow should feel like configuring a colleague, not filling a form.

### Creating one

Template gallery first (10 templates relevant to this market), then a guided flow:

1. **Name and purpose** — purpose written in plain language; this becomes the agent's instructions.
2. **Model** — full names, with "Same as chat (recommended)" as the default. Never `__inherit__`.
3. **What it may use** — connectors, skills and knowledge scopes as an explicit allow-list, each
   showing whether it reads or writes and whether it causes egress.
4. **Trigger** — *on request* · *on a schedule* (cron with a plain-English preview) ·
   *when something happens* (new mail matching a filter, a Jira issue entering a status, a
   document landing in a space) · *called by another agent*.
5. **Autonomy** — **Ask me before it acts** (default) · *Act, then tell me* · *Fully autonomous*,
   each stating exactly what that means for write actions.
6. **Guardrails** — max runs per day, a token/cost ceiling, allowed recipients for anything it
   sends, and an "always ask before" list. These are what make an autonomous agent safe to enable.
7. **Where the result goes** — chat · email · a Jira comment · a file in a knowledge space.
8. **Test it** — a dry run against real data that shows the trace and the output **without
   performing any write action**, before you save.

### Running and watching one

- **Run history** per agent: when, trigger, duration, tokens, tools called, outcome, and the full
  step trace on click. Include at least one failed run with a readable cause and a fix.
- **Agent-to-agent delegation** — show one agent calling another (e.g. *Board Pack Drafter* calls
  *PO Slippage Watch*), and draw that relationship somewhere.
- **A "while you slept" digest** — what ran overnight, what it produced, what needs you.
- **Versioning** — an agent's instructions have a history you can diff and roll back.
- **Pause / disable** without deleting, and a clear "last run failed" state on the card.

---

## 4. Many more connectors — with real, named actions

The demo should show a developer the full surface they need to build. Extend the connector
catalogue well beyond mail. For each, name the tools in plain language **and** give the underlying
tool id, and mark read vs write.

**Mail** (`magna-mail`) — search mail · read a message · list threads · draft a reply ·
**send mail** · **reply** · **forward** · flag / label · download an attachment.

**Jira** (`magna-jira`) — search issues (JQL) · read an issue · list boards and sprints ·
**create an issue** · **comment** · **transition status** · **assign** · **link issues** ·
**log work** · list transitions available.

Plus at least these, each with 3–6 named tools: **Confluence** (read page, search, create page),
**SAP S/4HANA** (purchase order lookup, goods-receipt status, vendor master),
**Primavera P6** (schedule read, critical path, baseline compare),
**SharePoint / Google Drive** (list files, read a document),
**Slack / Teams** (read a channel, post a message),
**ServiceNow** (search incidents, create an incident),
**Calendar** (read availability, create an event),
**HR system** (headcount, org chart lookup).

Rules:

- **Every write tool is off by default** and needs an explicit scope plus the approval prompt.
- Each connector states **on-prem** or **leaves your network**, and the write tools state what
  leaves when they run.
- A connector that is not connected still shows what it *would* give you — that is the sales case.
- Show at least one connector in an **error** state with a readable cause, and one in a
  **degraded** state (e.g. P6 data six days old), because a developer needs to build those views.

### Make it demonstrable in chat

At least one worked example per app that uses a write tool end to end, with approval:

> "Reply to Al-Rashid about the rebar slip and raise a Jira issue for the delay."

→ approval prompt → drafts the mail into an editable composer → drafts the Jira issue with
project, type, summary, description, priority and assignee → one confirmation showing **both**
actions → on confirm, both complete and both appear in the audit trail.

---

## 5. Keep everything

Do not regress: the fix-list, the real animated Magna mark and its use as the thinking indicator,
the six distinct logins with Google/Apple and the streamed demo preview, light/dark, responsive to
320 px, the rendered maths/code/SVG diagrams, the login → workspace → app flow, and the guided
skill/MCP steppers from v3.

Still one self-contained static file per app. No CDN, no backend, no build step — this deploys to
Vercel as static files.

---

## 6. Report

1. The custom-MCP flow: transports, fields, test-connection states, and where the JSON config appears.
2. The GitHub skill import: fields, what the repo listing shows, validation, and the source badge.
3. Agent creation: the steps, the trigger types, autonomy levels, guardrails, and what the run
   history shows.
4. The connector catalogue: how many, and which write actions are demonstrated end to end.
5. Confirm nothing from rounds one to four regressed.
