# 50 user flows — the coverage tracker

**Purpose.** The client wants to walk the real product against the way people actually use
ChatGPT, Claude and Codex, and see what is missing. So this is not a features list — it is
**50 concrete things a person sits down to do**, each with its happy path, and each marked with
what the product needs in order to support it.

The output is a single page, `flows.html`, linked prominently from `index.html`.

---

## What each flow must contain

| Field | Content |
|---|---|
| **№ and title** | Short, in the user's words — "Catch up on what I missed", not "Notification digest" |
| **Who** | The persona: Procurement lead · Delivery manager · HSE officer · Engineer · Finance · Executive · IT admin |
| **The ask** | The literal sentence a user would type |
| **Happy path** | 4–7 numbered steps, what the user does and what the system does back |
| **Needs** | The capabilities required — chips like `chat` `knowledge` `mail:read` `jira:write` `schedule` `artifact` `export:pptx` `vision` |
| **Status** | `Works` (built in the prototypes) · `Partial` (some of it) · `Gap` (not there yet) — judged against the six prototypes and the audit |
| **What's missing** | For Partial and Gap only: the specific thing to build. This is the column the client will act on. |

Be honest in **Status**. The value of this page is that it names gaps. Roughly: expect a good
number of `Works`, a solid band of `Partial`, and a real set of `Gap` — do not mark everything
green. Ground your judgement in `MagnaVERSEUXAudit.md`, `MagnaVERSEFullFunctionalUXSpec.md` and
what the six prototypes actually do.

---

## The 50 flows — build exactly these, in these nine groups

### A · Ask and understand (1–7)
1. Ask a straight question about company policy
2. Research a market or regulation with sources I can check
3. Compare two vendors and tell me which is riskier
4. Explain this contract clause in plain language
5. Summarise a 60-page report into one page
6. Ask a follow-up that depends on what we just said
7. Translate a document between Arabic and English

### B · Documents and writing (8–14)
8. Draft a board memo in our house format
9. Rewrite this paragraph to be shorter and firmer
10. Turn my rough notes into a structured brief
11. Draft a contract-amendment letter and let me edit it
12. Fill a template from data in a spreadsheet
13. Proofread and flag anything commercially risky
14. Produce a document I can hand to Legal as a file

### C · Data and analysis (15–21)
15. Analyse this spreadsheet and tell me what changed
16. Build a chart from these numbers
17. Compute an exposure model and show the maths
18. Find the outliers in this dataset and explain them
19. Reconcile two systems that disagree
20. Forecast a schedule slip from current trend
21. Export the analysis as a spreadsheet

### D · Mail (22–27)
22. What's in my inbox that needs me today?
23. Summarise this long email thread
24. Draft a reply in my voice and let me edit it
25. Send the reply, with a confirmation before it goes
26. Find the email where the supplier committed to a date
27. Turn an email into a task or a Jira issue

### E · Jira and delivery (28–33)
28. What is blocking the sprint right now?
29. Raise a Jira issue from this conversation
30. Comment on an issue and reassign it
31. Move an issue through its workflow
32. Give me a stand-up summary across three projects
33. Log work and update a remaining estimate

### F · Meetings and calendar (34–37)
34. What is on my day, and what should I prepare?
35. Find a time three people can meet
36. Turn meeting notes into decisions and owners
37. Prepare a briefing pack before a specific meeting

### G · Automation and agents (38–43)
38. Do this every weekday at six and send me the result
39. Watch for a condition and tell me when it happens
40. Build an agent that triages my inbox
41. Chain two agents — one gathers, one writes
42. Show me what ran overnight and what needs me
43. Stop an agent, edit it, and roll back a change

### H · Knowledge and connected systems (44–47)
44. Answer from our own documents, not the web
45. Add a document to knowledge and ask about it
46. Ask a question that spans SAP, P6 and mail at once
47. Tell me which system a number came from

### I · Making things (48–50)
48. Build me a slide deck for Sunday's steering committee
49. Write and run a script against our data
50. Make a diagram of this process I can put in a document

---

## Page requirements — `flows.html`

- **A summary layer** at the top: 50 flows, and the counts of Works / Partial / Gap, plus the
  count by group. Compute these at runtime from the data so the headline cannot drift.
- **Working filters**: by group, by status, by persona, plus a text search across title, ask and
  steps. Live count, an empty state, and a clear-filters action.
- **Each flow as a row that expands** to its happy path and its needs/missing detail. 50 entries
  must stay scannable — progressive disclosure is essential, and an "expand all" is welcome.
- **A gap summary section**: every `Gap` and `Partial`, grouped by the underlying capability that
  would unlock them, so the client can see that (for example) building document export unlocks
  four flows at once. Ordered by how many flows each capability unblocks — this is the roadmap
  view and it is the most valuable section on the page.
- Link each flow to whichever prototype demonstrates it best (`apps/app-1-chatgpt.html` …
  `apps/app-6-horizon.html`) where one does.
- Link to `how-to.html`, `before-after.html` and `functionality-map.html`.

## Technical contract — same as every page in this repo

- ONE self-contained HTML file. No CDN, no external font, no external image, no build step.
- Light AND dark, both first-class: tokens on `:root`, redefined under
  `@media (prefers-color-scheme: dark)` and again under `:root[data-theme="dark"]` /
  `:root[data-theme="light"]` so an explicit toggle beats the media query in both directions.
  Persist in `localStorage` under the key `mv-theme`, matching the other pages. Visible toggle.
- Responsive 320 px → 2560 px, no horizontal page overflow at any width. Tables scroll inside
  their own container. 44 px tap targets.
- The real Magna mark inline (see `BRIEF-ADDENDUM.md` §1) with **unique gradient IDs per
  instance** and the draw-in animation from §1a.
- System font stacks only. Real `<button>`/`<a>` elements, visible `:focus-visible`, sensible
  heading order, Escape closes any overlay, `prefers-reduced-motion` respected.
- Status colour must be semantic and distinct from the accent, legible in both themes.
- Real content throughout. The "ask" lines must sound like something a person would actually type.
