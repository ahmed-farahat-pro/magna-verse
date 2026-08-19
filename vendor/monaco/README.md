# Monaco Editor — vendored

`monaco-editor` 0.52.2, **MIT** (Microsoft). Licence text in `LICENSE`.

Vendored rather than loaded from a CDN. Console's own Sovereignty widget reads
`Egress today: 0 bytes`; a CDN script tag would make that false the moment the
Code window opened, and would break in an air-gapped deployment.

Trimmed from the 13 MB `min/vs` distribution down to 4.9 MB:

| Removed | Size | Why |
|---|---|---|
| `language/` | 6.4 MB | The TypeScript, JSON, CSS and HTML **IntelliSense services**. Console displays and edits code; it does not complete or type-check it. |
| `nls.messages.*.js` | 1.7 MB | Non-English locale bundles. English is built in. |

All 81 `basic-languages` tokenisers are kept, so syntax highlighting is
unaffected — verified: HTML tokenises to 8 distinct token classes with the
services removed.

Removing `language/` also removes the only reason Monaco spawns a web worker,
which sidesteps a real trap: workers resolve relative paths against their own
URL, not the page, so `../vendor/...` threw
`Failed to parse URL` on every boot. If you ever add the services back you will
need `MonacoEnvironment.getWorker` returning a Blob-bootstrapped worker whose
`baseUrl` is the **parent** of `vs` — passing the `vs` folder itself yields
`.../monaco/vs/vs/language/...`.

**Known limitation, accepted deliberately.** Monaco has no RTL support — there
is an open issue reporting the editor renders invisible inside a `dir="rtl"`
container. The Code window therefore pins `dir="ltr"` on the editor host, which
is correct regardless: source code is left-to-right even in an Arabic UI. Only
the editor viewport is pinned; the window chrome around it stays RTL-capable.
If a future requirement needs a bidi-capable editor, CodeMirror 6 (MIT) is the
alternative.

Upgrade: `curl -sL https://registry.npmjs.org/monaco-editor/-/monaco-editor-<v>.tgz`,
extract `package/min/vs`, then re-apply the trim above.
