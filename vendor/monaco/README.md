# Monaco Editor — vendored

`monaco-editor` 0.52.2, **MIT** (Microsoft). Licence text in `LICENSE`.

Vendored rather than loaded from a CDN. Console's own Sovereignty widget reads
`Egress today: 0 bytes`; a CDN script tag would make that false the moment the
Code window opened, and would break in an air-gapped deployment.

Trimmed from the 13 MB `min/vs` distribution:

| Kept | Why |
|---|---|
| `loader.js`, `base/`, `editor/` | The editor itself |
| `basic-languages/` — 13 of 81 | Tokenising for the languages Console shows |

Removed: `language/` (the TypeScript/JSON/CSS/HTML IntelliSense services, ~6.9 MB
— Console does not need completion or type checking) and all `nls.messages.*`
locale bundles (English is built in).

**Known limitation, accepted deliberately.** Monaco has no RTL support — there
is an open issue reporting the editor renders invisible inside a `dir="rtl"`
container. The Code window therefore pins `dir="ltr"` on the editor host, which
is correct regardless: source code is left-to-right even in an Arabic UI. Only
the editor viewport is pinned; the window chrome around it stays RTL-capable.
If a future requirement needs a bidi-capable editor, CodeMirror 6 (MIT) is the
alternative.

Upgrade: `curl -sL https://registry.npmjs.org/monaco-editor/-/monaco-editor-<v>.tgz`,
extract `package/min/vs`, then re-apply the trim above.
