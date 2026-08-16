# Landing pages — shared contract

Five landing pages for **MagnaVERSE**, Magna's sovereign enterprise AI workspace. Five genuinely
different designs, not one design in five colourways. Each is a single self-contained static HTML
file deployed to Vercel.

---

## The product, in one paragraph

MagnaVERSE is an enterprise AI workspace that looks like ChatGPT but runs on Magna's own GPUs —
on-prem, in-country, inside the customer's network. That is the whole proposition: the same
capability, without the data leaving. It is part of Magna AI, a joint venture of **Trend Micro**
and **Wistron**, powered by NVIDIA. The buyer is a Saudi enterprise — construction, energy,
manufacturing, government — with a CIO who wants the capability and a CISO who will not allow a
public API.

### Facts you may use (do not invent competing ones)

- **Deployment**: on-prem, sovereign cloud, or edge. Data residency guaranteed in-country.
- **Compute**: MagnaREACTOR AI POD — 1.2 exaflops, 28.4 TB HBM3e, NVIDIA GB300 NVL72 liquid-cooled
  racks, 800 Gbps/node fabric, 1.2–1.7 PUE. A typical workspace tenancy is 8×H200 in Riyadh DC-1.
- **Models, run privately**: Kimi K2 Instruct (1T MoE), DeepSeek V3.1 (671B MoE), Qwen 3 235B,
  NVIDIA Nemotron 120B.
- **Capabilities**: conversational workspace, 80+ pre-built agents across 34 verticals, workflow
  automation, enterprise connectors (SAP S/4HANA, Primavera P6, Jira, Confluence, mail via MCP),
  a digital-twin context graph, policy-enforced governance with audit trails.
- **Compliance**: ISO 27001 aligned, five global regions, 24/7 managed operations, red-team audited.
- **Proof points**: 1,000+ validated use cases. 0 bytes of egress on a private-tier answer.

Do not fabricate customer names, logos, testimonials or revenue figures. If a section needs social
proof, use the real JV and partner names (Trend Micro, Wistron, NVIDIA, and the stated cloud
partnerships) or use capability proof instead of customer proof.

---

## What every page must contain

1. A hero that states the proposition in one line a CISO would repeat.
2. The sovereignty argument, made concretely — where inference runs, what leaves, what does not.
3. What the product actually does — the workspace, agents, connectors, the MCP story.
4. A section on deployment options (on-prem / sovereign cloud / edge).
5. **Links into the live prototypes.** These files sit at `apps/` relative to the repo root:
   - `apps/app-1-chatgpt.html` — Familiar
   - `apps/app-2-claude.html` — Considered
   - `apps/app-3-sovereign.html` — Provable
   - `apps/app-4-launchpad.html` — Ready
   - `apps/app-5-twin.html` — Grounded
   - `apps/app-6-horizon.html` — Horizon
   Your page lives at the repo root, so link them as `apps/app-1-chatgpt.html`.
   Also link `functionality-map.html` and `index.html`.
6. A closing call to action — "Book a walkthrough" style. Forms may be present but must not
   pretend to submit anywhere; show an honest inline confirmation that it is a prototype.

---

## Technical contract — identical for all five

- **One self-contained file.** No CDN, no external font, no external image, no build step, no
  backend. Must work double-clicked from disk and deployed as a static file.
- **Light and dark, both first-class.** Palette as CSS custom properties on `:root`, redefined
  under `@media (prefers-color-scheme: dark)`, and again under `:root[data-theme="dark"]` and
  `:root[data-theme="light"]` so an explicit toggle beats the media query in both directions.
  Style components through tokens only — never put component rules inside the media query.
  Persist the choice in `localStorage`. Visible toggle.
  A page may commit to a single visual world if that is a deliberate design decision — but say so
  in your report rather than omitting the second theme by accident.
- **Responsive 320 px → 2560 px**, no horizontal page overflow at any width. 44 px tap targets.
  Check at 320, 375, 768, 1024, 1440.
- **The real Magna mark**, inline SVG, from `BRIEF-ADDENDUM.md` §1 — with **unique gradient IDs per
  instance** (duplicate IDs silently break every copy after the first) and the draw-in animation
  from §1a.
- **Fonts**: system stacks only. A CDN webfont would silently fall back.
- **Motion** respects `prefers-reduced-motion`. Any scroll-driven effect must degrade to a static
  layout, not to an empty one — never leave content hidden because an observer did not fire.
- **Accessibility**: real `<button>`/`<a>` elements, visible `:focus-visible`, `aria-label` on
  icon-only controls, one `<h1>`, sensible heading order, Escape closes any overlay.
- **Copy is design material.** Write it properly. No lorem, no "Lorem-adjacent" filler like
  "Feature One". Specific beats clever.
- Avoid the current AI-design clichés: purple-to-blue gradient hero on white, near-black with a
  lone acid-green pop, warm cream + serif + terracotta, glassmorphism by default, emoji as section
  markers, everything centred, an accent bar on every rounded card.

---

## Report

1. Your design's thesis in two sentences, and what makes it different from the other four.
2. Palette and type decisions, and why they suit the subject.
3. Widths verified, and the theme behaviour.
4. Anything you'd flag.
