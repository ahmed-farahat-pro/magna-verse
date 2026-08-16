# Brief v4 — six distinct logins, social sign-in, and a live demo preview

Adds to BRIEF.md, BRIEF-ADDENDUM.md, BRIEF-V2.md and BRIEF-V3.md. All still apply.

---

## 1. The six login screens must be **totally different from each other**

Right now they risk converging on the same split-screen: brand left, form right. The client wants
six genuinely different shapes — while every one stays obvious to use. Differentiation is in the
**composition**, not in making any of them clever or hard.

Each app gets the login below. Do not adopt another app's shape.

| App | Login composition |
|---|---|
| **1 · Familiar** | **Centred single column.** No split. A narrow ~400 px stack on a plain ground: mark, "Sign in to MagnaVERSE", social buttons, a hairline "or" divider, email + password, primary button. The ChatGPT/Linear idiom — the whole page is one calm column. Demo preview sits *below* the fold as a "See it in action" section. |
| **2 · Considered** | **Editorial split, 60/40.** Left is a warm-paper essay panel — a real pull-quote about sovereign AI, set in your display face, with the mark small and quiet. Right is the form on a slightly lighter surface. Feels like the inside cover of a book. |
| **3 · Provable** | **Console / pre-flight check.** Full-bleed dark instrument panel. The form sits inside a bordered "terminal" card, and beside it a live pre-flight readout that fills in line by line as the page loads: `resolving magna-ksa-prod… ✓`, `cluster DC-1 · 8×H200 · healthy ✓`, `TLS 1.3 · certificate pinned ✓`, `egress to public internet · blocked ✓`. Signing in appends `authenticating on-prem… ✓`. Security-forward, and it makes the on-prem promise felt before you are even inside. |
| **4 · Ready** | **Login over a live workspace.** The launchpad renders behind, softly blurred and dimmed, with the sign-in as a floating elevated card. Around it, three small "waiting for you" cards peek through — *2 tasks ran overnight*, *1 thread needs you*, *6 systems connected*. You can see the value before you are in. |
| **5 · Grounded** | **Graph-first.** An animated inline-SVG node graph of the 16 twin sources occupies the left two-thirds, edges drawing themselves in, connected nodes green and missing ones amber. The form is a compact panel anchored bottom-right. The product's thesis as the backdrop. |
| **6 · Horizon** | **Spatial.** The omni-input *is* the login. A centred field on the canvas, ambient telemetry drifting behind, cards easing into place as you authenticate. No conventional card at all. |

Constraints for all six: legible labels, a real `<label>` per field, visible focus states, inline
validation, 44 px targets, and a keyboard path that works. **Different in shape, identical in
ease.**

---

## 2. Google and Apple sign-in

Every login gets **Sign in with Google** and **Sign in with Apple** alongside Magna SSO.

Follow each vendor's actual button conventions, since a manager will notice if they look wrong:

**Google** — white button, 1 px `#747775` border (dark theme: `#131314` fill, `#8E918F` border),
`Roboto`-ish system fallback, the four-colour "G" at 18–20 px on the left, label
"Sign in with Google". Never recolour the G, never put it on a coloured fill, keep clear space
around it, and keep the button height ≥40 px.

**Apple** — solid black button with white text and the Apple logotype in white (light theme), or
white button with black text and a black logo (dark theme). Label "Sign in with Apple". Corner
radius consistent with the other buttons; do not stretch or recolour the mark.

Draw both marks as **inline SVG**. Match each button's visual weight to the others so no provider
dominates.

### The hard rule

These are **demo buttons in a prototype**. Clicking one must go **straight into the demo session**
— optionally via a brief "Authorising with Google…" state using the Magna mark.

**Never render a fake Google or Apple sign-in screen, and never show a field that asks for a
Google or Apple password.** A convincing replica of a real provider's credential screen is a
phishing page regardless of intent, and this repo is going to be deployed publicly. The provider
round-trip is always simulated, never imitated.

The same rule already applies to the mail MCP connect flow: no third-party password fields.

---

## 3. The live demo preview — "see what's inside before signing in"

ChatGPT and Claude both show you the product before you commit. The client wants the same: on the
login screen, a **streamed preview of a real conversation**, so a manager who never signs in still
understands what the product does.

### Behaviour

- A device-framed or panel-framed preview showing a **prompt being typed character by character**,
  then the **Magna mark thinking indicator**, then an **answer streaming in token by token** — with
  the real rendering on display: a formatted answer, a citation chip, a small table or a rendered
  equation, and the residency line.
- **Loop through 2–3 scenarios**, each making a different point:
  1. *"Which POs slipped past their promised date this month?"* → a short table, sourced from SAP —
     shows connected enterprise data.
  2. *"Summarise the change orders on Package 4 and who owns the risk."* → prose with citations and
     a grounding chip — shows provenance.
  3. *"What's in my inbox about the rebar delay?"* → a mail result via the `magna-mail` MCP tool —
     shows the new email capability.
- Between scenarios, a caption states what was just demonstrated, e.g.
  *"Ran on Magna GPUs in Riyadh — nothing left the network."*

### Rules

- **It must never block or slow the form.** The form is the priority; the preview is ambient.
- **Pause/play control**, and small scenario dots to jump between them.
- Under `prefers-reduced-motion: reduce`, **do not animate** — render the final state of scenario 1
  immediately and let the dots switch between finished states.
- On mobile (`< 768px`) the preview moves **below** the form, or collapses to a "See a 20-second
  demo" disclosure. The form must be reachable without scrolling on a 320 × 568 screen.
- Pure CSS/JS, no video file, no external asset.
- Clean up your timers on teardown so leaving the login does not leave intervals running.

---

## 4. Mobile web, again — check it properly

The client repeated that the site must work on mobile web. Re-verify **every** screen you now
have — login, workspace picker, and each view you added in v2/v3 — at **320, 375, 414 and 768 px**:

- `document.documentElement.scrollWidth - clientWidth === 0` at each width, on each view.
- No interactive element under 44 × 44 px.
- Steppers (skill/MCP/mail wizards) become full-screen sheets, not squeezed modals.
- Data tables scroll inside their own container.
- The composer stays reachable with the keyboard open — `100dvh`, not `100vh`.

State in your report which views you checked at which widths.

---

## 5. Report

Add to your existing report:

1. Your login's composition, and one sentence on why it is different from the other five.
2. Google/Apple buttons — confirm they follow vendor conventions and that **no fake provider
   credential screen exists anywhere in the file**.
3. The demo preview — scenarios, controls, reduced-motion behaviour, mobile placement.
4. The width × view matrix you verified.
