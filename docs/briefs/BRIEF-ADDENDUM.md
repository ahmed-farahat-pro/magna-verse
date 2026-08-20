# Addendum — real Magna logo, responsive, interactive

Client feedback after reviewing round one. Apply all three parts to your app file.

---

## 1. Use the real Magna mark

The client supplied the production logo
(`https://magnaai.com/assets/magna-logo-navbar-6ESvLCOc.svg`). The original is 1.1 MB — it
embeds a base64 font and two raster images — so it has been rebuilt as clean vector.

**Replace every logo/brand mark in your file with exactly this markup.** Do not invent your own
mark, do not use a letter in a coloured box, do not use an emoji.

```html
<svg class="magna-mark" viewBox="0 0 640 440" role="img" aria-label="Magna">
  <defs>
    <linearGradient id="mgGB-UNIQUE" x1="60" y1="386" x2="577" y2="33" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#2FB44A"/>
      <stop offset=".52" stop-color="#1F8F86"/>
      <stop offset="1" stop-color="#1E50C8"/>
    </linearGradient>
    <linearGradient id="mgR-UNIQUE" x1="32" y1="35" x2="285" y2="213" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#DC3232"/>
      <stop offset="1" stop-color="#A3241A"/>
    </linearGradient>
  </defs>
  <path d="M60 386 L577 33 L577 370" fill="none" stroke="url(#mgGB-UNIQUE)"
        stroke-width="52" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M32 380 L32 35 L285 213" fill="none" stroke="url(#mgR-UNIQUE)"
        stroke-width="52" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

Notes:

- **Gradient IDs must be unique per instance in a document.** If you place the mark more than
  once, suffix the IDs (`mgGB-side`, `mgGB-empty`, …) and update the matching `url(#…)`.
  Duplicate IDs silently break the second instance's fill.
- Size it with CSS on `.magna-mark` (e.g. `width:26px;height:auto`). The mark is 640×440, so it
  is **wider than it is tall** — never force it square, and never `object-fit` it.
- It is full-colour and reads correctly on both light and dark grounds, so **do not** recolour it
  per theme. Do not apply `filter`, `opacity` below .9, or `currentColor` to it.
- The wordmark next to it is plain text: `Magna` in the body font at 650 weight, followed by
  `VERSE` in the muted token colour. Keep them on one baseline with ~10px of gap.
- A copy also lives at `assets/magna-mark.svg` for reference — but your file must stay
  self-contained, so inline it rather than linking it.
- If your app uses the animated brand backdrop (D11), animate **this** mark — a slow drift,
  a gentle stroke-dashoffset draw, or a soft scale pulse. Keep it behind the sidebar or the
  empty state only, at low opacity, and wrap it in `@media (prefers-reduced-motion: no-preference)`.

### 1a. Keep the mark animated (client request)

The mark must **draw itself in** on load. Both strokes are open paths, so a `stroke-dashoffset`
draw works directly on them — no masks needed. Use exactly this, adapting the class name:

```css
.magna-mark path{ stroke-dasharray:1200; stroke-dashoffset:0; }
@media (prefers-reduced-motion: no-preference){
  .magna-mark path{ animation:mgDraw 1.5s cubic-bezier(.16,1,.3,1) both; }
  .magna-mark path:nth-of-type(2){ animation-delay:.18s; }   /* red follows green→blue */
}
@keyframes mgDraw{ from{ stroke-dashoffset:1200 } to{ stroke-dashoffset:0 } }
```

Under `prefers-reduced-motion: reduce` the mark must simply appear, fully drawn — never hidden.

### 1b. The mark is the thinking indicator

Replace whatever "assistant is typing" affordance you built (three bouncing dots, a spinner, a
pulsing block) with the **Magna mark, animating**, followed by the status text. This is a direct
client request and it is the moment the brand should be most visible.

While a response is pending, show the mark looping — a continuous draw-and-fade, or a slow
opacity/scale pulse on the two strokes with a small stagger between them. Loop it for as long as
the request is pending, then swap it for the finished answer. Suggested:

```css
@media (prefers-reduced-motion: no-preference){
  .mg-thinking path{ animation:mgLoop 1.9s ease-in-out infinite; }
  .mg-thinking path:nth-of-type(2){ animation-delay:.22s; }
}
@keyframes mgLoop{
  0%   { stroke-dashoffset:1200; opacity:.35 }
  45%  { stroke-dashoffset:0;    opacity:1   }
  100% { stroke-dashoffset:-1200;opacity:.35 }
}
```

Pair it with honest status text that changes as the turn progresses — e.g.
`Thinking…` → `Searching Company Knowledge…` → `Writing…`. Under reduced motion, show the static
mark plus the text only.

**This is required in all five apps**, and it is the single most important detail in
`app-1-chatgpt.html`, where the client specifically asked to see the logo appear and animate when
a prompt is sent.

---

## 2. Make it genuinely responsive

The live MagnaVERSE app is not responsive at all. The client wants these prototypes to work on a
phone. Support three ranges, and make sure nothing overflows horizontally at any width from
**320 px to 2560 px**.

### Desktop — `≥ 1024px`
Current layout. Sidebar and any right-hand panel visible together.

### Tablet — `768px – 1023px`
- The sidebar collapses to icons, or to an overlay drawer.
- Any right-hand panel (artifact / residency / context rail) becomes a **toggleable overlay**
  rather than a third column — reachable from a button in the thread bar.
- Transcript keeps comfortable measure; reduce outer padding, not line-height.

### Mobile — `< 768px`
- **Sidebar becomes an off-canvas drawer**: hidden by default, opened by a hamburger button,
  slides in over a scrim, closes on scrim tap, on Escape, and on selecting a conversation.
  Trap focus while open and set `aria-expanded` on the trigger.
- Right-hand panels become **full-screen sheets** (or bottom sheets) with an explicit close.
- The composer is **sticky to the bottom** and must stay above the iOS keyboard — use
  `min-height:100dvh` (with a `100vh` fallback) on the app shell, not `height:100vh`.
- Modals (settings, guardrail) become full-screen or bottom sheets; no fixed pixel widths.
- **Tap targets ≥ 44×44 px.** Composer chips, message actions and picker rows all need this —
  icon-only 28px buttons are too small for touch.
- Message action rows may collapse to the 2 most-used actions plus an overflow "…" menu.
- Tables and code blocks scroll **inside their own container** (`overflow-x:auto`), never the page.
- The rendered maths block must not force horizontal page scroll — let it scroll internally.
- Wide multi-column grids (intent cards, tier cards, starter rows) collapse to one column.
- Keyboard-shortcut hints (`⌘K`, `↵ send`) hide on touch widths — they are noise on a phone.

### Test it
Before you finish, check your own layout at **320, 375, 414, 768, 1024, 1440** px. State in your
report that you did, and name anything that is still imperfect.

---

## 3. Interactivity — verify, don't assume

Everything in §4 of the main brief must actually work when clicked. Go through your own file and
confirm each item below responds to a real click or keypress — several round-one builds wired the
markup but left handlers unbound.

- [ ] Enter sends; Shift+Enter inserts a newline; the composer auto-grows and resets after send
- [ ] A typing indicator appears, then the assistant reply appends, and the view scrolls to it
- [ ] Sidebar conversation switching swaps the transcript
- [ ] Sidebar collapse/expand (desktop) and drawer open/close (mobile)
- [ ] New chat → empty state
- [ ] Theme toggle cycles and persists across reload
- [ ] Model picker opens, selects, updates its label, closes on outside-click and Escape
- [ ] Sovereignty tier picker + the Public guardrail confirm
- [ ] `/` opens the slash menu; typing filters; ↑↓ move; Enter inserts; Escape closes **and
      returns focus to the composer**
- [ ] `⌘K` / `Ctrl+K` opens the palette; typing filters; Escape closes
- [ ] Settings modal opens, switches categories, closes
- [ ] Every copy button copies and shows "Copied"
- [ ] The reasoning line expands and collapses
- [ ] The first-run tour card dismisses and stays dismissed after reload
- [ ] Your app's signature panel (artifact / residency / context rail) actually responds
- [ ] No JavaScript errors in the console on load or on any of the above

Add `console.assert`-free, dependency-free vanilla JS only. No frameworks, no CDN.

---

## 4. Report back

1. Confirm the real mark is in place and say how many instances you inlined (and that the
   gradient IDs are unique).
2. The responsive changes you made, per breakpoint, and the widths you checked.
3. The interactivity checklist above, each marked working / fixed / not working.
4. Anything still imperfect.
