# @magna/os — layer 2

The MagnaVERSE desktop as a DeepSeek Harness plugin. It claims `ctx.magnaOS`, serves the desktop at
`/desktop`, and taps the session event stream.

Serving the UI *from inside* the harness is the whole architectural move. A browser on another origin
calling `127.0.0.1:3080/api` gets a hard **403** — the trust fence refuses `sec-fetch-site:
cross-site`, requires `Origin` to equal `Host`, and sends no CORS headers, none of it configurable.
Served from `/desktop`, the page is same-origin, so `fetch('/api/…')` and the events socket simply
work. No proxy, no second server.

## Install

```bash
dsh plugin --profile web add ./packages/os
./scripts/link-harness.sh
```

Then restart `dsh web` and open <http://127.0.0.1:3080/desktop>.

The first command links the package and — because `package.json` declares `dsh.bundle.patch` — appends
it to `dsh.profile.bundles` automatically. If it warns *"declares no dsh.bundle"*, that field is wrong.

The second is not optional, and the reason is not obvious: `dsh plugin add` of a local directory
installs it with pnpm's `link:` protocol, so the package stays in this repo and Node resolves its
imports by walking up from **here** — it never reaches `$DSH_HOME/profiles/node_modules`. That farm
works for packages installed from the registry, which physically live under the profile. It does not
help a linked one. The script links the harness's *own* cordis in; installing a second copy would give
you two `Service` base classes and a service registered against one would be invisible to the other.

Remove with `dsh plugin --profile web remove @magna/os` — every `ctx.effect` disposer unwinds the
route, the tools and the registry entries in reverse.

## Connecting models

Any OpenAI-compatible endpoint is configuration, not code. Ollama, as a hand-declared route:

```yaml
llm-pi-ai:
  providers:
    ollama:
      displayName: Ollama (local)
      api: openai-completions
      baseURL: http://127.0.0.1:11434/v1
      apiKeyEnv: OLLAMA_API_KEY
      models:
        - id: qwen2.5-coder:14b
          name: Qwen2.5 Coder 14B
          contextWindow: 32768
```

Two things that are easy to get wrong:

- **A hand-declared route still needs a credential.** pi-ai fails the request with
  `No API key for provider: ollama` even though Ollama does not authenticate, and the profile schema
  accepts only `apiKeyEnv` — a *reference*, never a literal. Store a dummy through the credentials
  seam: `credentials.set {ref: OLLAMA_API_KEY, value: local-no-auth}`.
- **Do not hijack the `openai` route to point at Ollama.** It works, but it replaces the real OpenAI
  catalog (38 models drop to however many you list) and sends your real `OPENAI_API_KEY` to
  localhost. Declare `ollama` as its own route instead.

Write both through the API rather than editing the YAML, which is what the UI does and what keeps the
running process in sync:

```
settings.mutate  {ns: 'llm-pi-ai', ops: [{op:'set', path:['providers','ollama'], value: {…}}]}
credentials.set  {ref: 'OLLAMA_API_KEY', value: 'local-no-auth'}
```

Cloud providers need only `apiKeyEnv` — the endpoint, protocol and model catalog come from pi-ai.

## The client contract

Verified against a live harness, not read from a document. Three of these are not what you would
guess, and each one fails silently rather than loudly.

| | Shape |
|---|---|
| Request | `POST /api/<method>` with `{type:'client-request', rpcId, method, payload}` |
| Response | `{type:'server-response', rpcId, result:{ok:true, value} \| {ok:false, error}}` |
| **Mux frame** | `{type:'server-request', rpcId, method:'session/event', payload:{…}}` — **the frame kind is in `method`, not `type`.** Matching on `type` sees only the literal `"server-request"` and receives nothing |
| **Prompt** | `session.prompt` returns `{accepted:true}` — a **receipt, not a completion**. Output arrives on the mux. Awaiting it for output looks like a hang, then hits the 30 s timeout |
| **Model** | `session.create` accepts a `model` field and **ignores it**. Use `session.selectModel({sessionId, provider, model})` or the session quietly runs on the deployment default |
| Token | `assistant/chunk` where `chunk.type === 'text-delta'`, text in **`chunk.text`** (not `chunk.delta`) |
| End | `turn/end` with `reason.kind` of `completed` or `error` |
| Stop | `session.cancel({sessionId})` |
| Models | `llm.models` → `{groups:[{id, name, models:[{id, name}]}]}` |
| Discovery | `llm.discoverModels` takes `{settingsNs, provider, baseURL, api}` — the **baseURL comes in the payload**, not from saved settings, because the UI probes a draft before saving |

Measured on this machine: first token **348 ms** from Ollama through the full harness path.

## Layout

```
lib/index.js      the plugin — name, inject, apply; route + session tap, both via ctx.effect
lib/registry.js   ctx.magnaOS — app registry, action bus, command bus
lib/http.js       the /desktop handler and the __os/* health surface
public/           the desktop itself
cordis.patch.yml  the one composition row
```

Two rules the code depends on:

- **Config is validated by hand** rather than with a schema library. Every import from the harness is
  another entry in `link-harness.sh`, so the dependency list is deliberately one package long.
- **Action attribution is stamped, never accepted.** `registerApp` returns a disposer carrying a
  scoped handle, and that handle fills in `appId` from the registration. Attribution a caller can set
  is attribution a marketplace plugin can forge, and a brain that is confidently wrong about who did
  what is worse than no brain at all.

## Health

```
GET /desktop/__os/state    the registry, recent actions, recent session events
GET /desktop/__os/apps     the installed app manifests
```

## Writing an app plugin

`packages/app-docs` is the reference. An app is four things and reaches the OS
and nothing else — no `ctx.webServer`, no `ctx.sessions`, no other app's state.

```js
export const inject = ["magnaOS", "tools"];   // Cordis holds the app until the OS exists

export function apply(ctx) {
  const dispose = ctx.magnaOS.registerApp({
    id: "docs", name: "Docs",
    window: { w: 780, h: 600 },
    placement: { dock: true, order: 20 },
    contributes: { tools: ["docs_create"], commands: ["list", "create"] },
    clientRoot: resolve(HERE, "..", "client"),   // served at /desktop/plugins/docs/
  }, invoke);                                    // (command, args) => any

  const scope = dispose.scope;                   // stamps appId; cannot be forged
  ctx.effect(() => ctx.tools.register(defineTool({ name: "docs_create", ... })));
}
```

The browser half exports `mount(host, root)` and may return an unmount function.
`host.invoke(command, args)` and `host.observe(action)` are the only doors it
has. Both a click and an `os_invoke` tool call land on the same `invoke`
handler, which is what stops the two paths drifting and what keeps a person's
work as visible to the brain as the agent's.

## Traps found the hard way

Each of these failed at plugin load or silently at runtime, not in a test.

| Symptom | Cause |
|---|---|
| `Receiver must be an instance of class MagnaOS` | Cordis hands consumers a **Proxy** around a service so it can track which context reached it. A `#private` field brand-checks and the Proxy fails it. Use `_underscore` methods, as the harness's own services do. |
| `parameters.x.required must be true when present` | An optional tool parameter must **omit** `required`. `required: false` is rejected. |
| `schema.properties.x.type must be string/…/json` | A free-form tool output value needs `{ type: "json" }`. An untyped `{}` is rejected. |
| `Unexpected token '<'` loading the page script | The desktop is served at `/desktop` with **no trailing slash**, so a relative `src` resolves against `/` and falls through to the harness SPA fallback, which returns HTML. Use absolute paths. |
| Prompt context appears to be missing | `systemPrompt.context()` contributions do **not** land in `header.system`. They are materialized as a runtime-context **user message**. Looking in the system prompt finds nothing and suggests a bug that is not there. |
| A restart makes the brain report plumbing | App registration emits an `install` action, which then becomes the most recent activity for that app. Lifecycle verbs are filtered out of the summary. |
| An approval bar that never clears | `approval/resolved` on the mux and the `/api/respond` receipt **race**, and in testing the resolved frame arrived first. Settle on whichever lands first. |

## The brain

Two halves and two stores, in `lib/brain.js`.

The agent half is free: one `ctx.on('session/event')` listener on a host context
receives every tool call, message, approval and turn boundary in every session.
The human half is `magnaOS.observe`, which is the single write path for anything
a person does in an app.

Both feed a workspace-scoped journal at `$DSH_HOME/magna/activity.json`, and
that is deliberate rather than using only a session projection: a projection is
scoped to one conversation, so an hour of work with no chat open produces no
session, no projection, and no memory of it. `systemPrompt.context()` renders
the journal at every prompt assembly — a function, not a string, so the model
reads the desktop as it is now.

Verified: work performed through the command bus with **no session open**, then
a fresh session asked "which document was I most recently working on", answered
correctly by a local Ollama model, and still answered correctly after a restart.
