# Brief v3 — make adding skills and connecting MCPs genuinely easy

Adds to [BRIEF.md](BRIEF.md), [BRIEF-ADDENDUM.md](BRIEF-ADDENDUM.md) and [BRIEF-V2.md](BRIEF-V2.md).
Everything in those still applies.

---

## The problem this fixes

Today, per the functional spec:

- **Skills** live behind `Tools → Skills 18/18` as a checkbox list of internal names
  (`heartbeat`, `magna-api-skill-generator`, `jira-ticket-definer`, and one that reads
  `elon-musk-perspective-en (failed to parse SKILL…)`) with truncated descriptions, all on by
  default. The user is being asked to make a decision they have no way to evaluate.
- **MCP servers** are reachable only through `Tools → {} MCP`. Nothing explains what an MCP server
  is, what tools it exposes, when it fires, or how to add one. One entry points at
  `salesforce-uat-api` on a `.sandbox.my.salesforce.com` URL.

The client's ask: **adding a skill and connecting an MCP must be easy, and the app must show the
user the steps to do it.** Treat these as first-run tasks a non-technical procurement lead
completes without help.

---

## 1. The shared pattern: a guided stepper

Both flows use the same 4-step pattern, with a visible progress indicator, a **Back** on every step
after the first, and a summary before anything commits.

```
①  Choose        →  ②  Configure      →  ③  Permissions    →  ④  Done
   what it is        account/scope        what it may do       + how to use it
```

Rules for both:

- **Never open on a form.** Step 1 is always a browsable catalogue of cards, not fields.
- **Plain language over internal names.** The card says "Search Jira issues and create tickets",
  and shows `jira-search` as small monospace secondary text — never the reverse.
- **Every step states what happens next**, and the final step says how to actually use the thing.
- **The primary button is never generic.** "Connect Magna Mail", not "Next", on the committing step.
- **Nothing is enabled by default that has side effects.** Read-only on, write off.
- Escape and a visible close both exit; exiting before step 4 commits nothing.

---

## 2. Adding a skill

### 2.1 The catalogue

A **Skills** view (under Connections) with a searchable, filterable grid. Each skill card shows:

| Element | Content |
|---|---|
| Name | Plain-language: "Daily HSE digest" |
| Internal id | `hse-digest`, small, monospace, muted |
| What it does | One sentence a procurement lead understands |
| Requires | The connections it needs — "Needs: Company Knowledge" — with a warning chip if missing |
| Example | A real prompt, e.g. *"Summarise this week's HSE incidents for the steering pack"* |
| State | A toggle: **Off / On**, plus "Auto" where the model decides |

Filters: category (Reporting · Engineering · Procurement · HSE · Admin), state, and "Ready to use"
vs "Needs a connection". Search matches name, description and id.

**Do not ship 18 skills all on by default.** Ship a sensible handful on, the rest off and
discoverable. A "Recommended for your role" row for a procurement lead is a good touch.

### 2.2 Try it before you commit

Every skill card has a **Try it** action that inserts its example prompt into the composer — it
drafts, it does not send. This is how a user evaluates a skill instead of guessing from its name.

### 2.3 Adding a new one

`+ Add skill` offers three routes, as cards:

1. **From the catalogue** — the common path, one click to enable.
2. **From a template** — a short guided flow: name it, say what it should do in plain language,
   pick which connections it may use, pick a trigger (on request / scheduled / when an agent calls
   it). Show a live preview of the resulting skill card as they type.
3. **Import** — paste or upload a skill definition. **Validate it and show a real, readable error
   if it fails** — this is the fix for `elon-musk-perspective-en (failed to parse SKILL…)` shipping
   to end users. A broken skill must never appear in a user-facing list; it belongs in an
   admin-visible error state with the parse failure explained.

### 2.4 Show the steps

A first-time Skills view shows a short **"How skills work"** explainer inline — three steps with
small diagrams, not a modal: *Turn one on → Ask for it in chat, or type `/` → Magna runs it and
shows you what it did.* Dismissible, with a "Show me again" in Help.

---

## 3. Connecting an MCP server

### 3.1 The catalogue

A **Tools & MCP** view listing servers as cards, each with:

| Element | Content |
|---|---|
| Name | "Magna Mail", "Jira", "SAP purchase orders" |
| What it is | One sentence — and one sentence on **what an MCP server is**, once, at the top of the view |
| Tools it exposes | Named, in plain language: "Search mail · Read a message · Draft a reply · Send mail" |
| Where it runs | `on-prem` green chip, or `leaves your network` amber chip |
| Status | Not connected · Connected · Error, with the last sync time |

`+ Add server` offers the same three routes: from the catalogue, from a template
(name, transport, endpoint, auth), or import a config.

### 3.2 The connect stepper

This is the flow specified in BRIEF-V2 §2 for mail — apply the same shape to every server:

1. **Choose** the provider/variant, with residency consequences stated per option.
2. **Configure** the account or endpoint. **Never a password field for a third-party account** —
   simulate the provider's own authorisation window.
3. **Permissions** — explicit scope checkboxes, read on, write off, each in plain language
   ("Send mail as you" not `mail.send`).
4. **Done** — show what got connected, the granted scopes, and **how to use it right now**:
   the tool names, the `/` commands they map to, and a **Try it** button that inserts an example.

### 3.3 Test connection

A **Test connection** action on every connected server that runs a visible check and reports a
real result — which tools responded, latency, and a readable error if not. The live app gives no
way to tell a working server from a broken one.

### 3.4 After connecting, the app must change visibly

Connecting a server is pointless if nothing happens. On success:

- Its tools appear in the `/` menu (and were greyed with a "Connect …" affordance before).
- The connection count in the sidebar/status row increments.
- Any surface that depends on it updates — starter prompts, twin coverage, agent tool pickers.

---

## 4. A setup checklist

Give the app a lightweight **"Finish setting up"** checklist, reachable from the sidebar and shown
on first run, with real completion state persisted in `localStorage`:

- [x] Sign in
- [x] Choose a workspace
- [ ] Connect your mail — *unlocks reading and drafting from chat*
- [ ] Turn on your first skill — *try the HSE digest*
- [ ] Add a knowledge source — *so answers cite your documents*
- [ ] Create your first agent — *something that runs while you sleep*

Each row states the benefit, not the task. Clicking a row starts that flow. The checklist
disappears when complete, with a "Show setup" in Help. Ticking items must genuinely reflect what
the user has done in the prototype.

---

## 5. Report

Add to your existing report:

1. The skills catalogue — filters, the Try-it path, and the three add routes.
2. The MCP connect stepper, test-connection, and what visibly changes after connecting.
3. The setup checklist and where its state lives.
4. Confirm the broken-skill import error is handled readably.
