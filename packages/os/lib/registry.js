import { Service } from "@deepseek-ai/cordis";

/**
 * The layer-2 service.
 *
 * A note on `_record` / `_push` / `_notify` rather than `#record` and friends:
 * Cordis hands consumers a Proxy around the service instance so it can track
 * which context reached it. A `#private` field performs a brand check that a
 * Proxy fails, so the first call from another plugin dies with "Receiver must
 * be an instance of class MagnaOS" - at plugin load, not in a test. Underscore
 * methods are the convention the harness's own services use.
 * Everything at layer 3 talks to this and nothing else,
 * which is the whole point: an app plugin that could reach `ctx.tools` or
 * `ctx.webServer` directly would not be an app, it would be a second OS.
 *
 * Three responsibilities, deliberately kept separate:
 *   - the app registry   — what is installed, and what the desktop should show
 *   - the action bus     — what just happened, from either a human or an agent
 *   - the command bus    — how anything asks an app to do something
 */
export class MagnaOS extends Service {
  /**
   * @param ctx    Cordis context that owns the service and its registrations.
   * @param config validated plugin config.
   */
  constructor(ctx, config) {
    super(ctx, "magnaOS");
    this.config = config ?? {};
    /** @type {Map<string, object>} appId -> manifest */
    this.registry = new Map();
    /** @type {Map<string, Function>} appId -> invoke handler */
    this.handlers = new Map();
    /** Ring buffer of recent actions. Bounded — a live view, not a log. */
    this.recentActions = [];
    /** Ring buffer of recent session events, same reasoning. */
    this.recentEvents = [];
    /** @type {Map<string, Function>} appId -> its ctx.effect disposer */
    this.disposers = new Map();
    /** @type {Map<string, string>} package name -> appId */
    this.pkgToApp = new Map();
    /** @type {Set<Function>} */
    this.watchers = new Set();
  }

  /* ---- the app registry ------------------------------------------------ */

  /**
   * Register one app. Returns the disposer, so removing the plugin unwinds the
   * dock entry, the desktop icon and the spotlight alias without anyone having
   * to remember to clean them up.
   *
   * @param manifest {object} id, name, and optional icon/window/placement/permissions
   * @param invoke   {Function=} command handler: (command, args) => any
   * @returns {() => void} disposer
   */
  registerApp(manifest, invoke) {
    const id = manifest && manifest.id;
    if (typeof id !== "string" || id.trim().length === 0) {
      throw new TypeError("magnaOS.registerApp: manifest.id must be a non-empty string");
    }
    if (this.registry.has(id)) {
      throw new Error('magnaOS.registerApp: "' + id + '" is already registered');
    }
    if (typeof manifest.name !== "string" || manifest.name.trim().length === 0) {
      throw new TypeError('magnaOS.registerApp: "' + id + '" must declare a display name');
    }

    const entry = {
      id: id,
      name: manifest.name,
      publisher: manifest.publisher ?? "Magna",
      version: manifest.version ?? "0.0.0",
      icon: manifest.icon ?? "i-app",
      tile: manifest.tile ?? "g-default",
      window: Object.assign({ w: 720, h: 560, minW: 380, minH: 320, multi: false }, manifest.window ?? {}),
      placement: Object.assign({ dock: false, desktop: true, order: 999 }, manifest.placement ?? {}),
      aliases: manifest.aliases ?? [],
      permissions: Object.assign({ grant: [], deny: [] }, manifest.permissions ?? {}),
      /* `ingress: true` opts an app into `/desktop/hook/<appId>/*`, which
         reaches its `__ingress` command from OUTSIDE the same-origin fence.
         Off by default and never inferred: an app gets an inbound endpoint only
         by asking for one in its manifest. */
      /* `commandParams` lets an app describe a command's arguments as a form
         instead of leaving every caller to hand-write JSON. The Workflow
         palette reads it, so "Docs · create" gets a Title and a Body field
         rather than a blob nobody can fill in correctly. */
      contributes: Object.assign(
        { tools: [], commands: [], readOnly: [], ingress: false, commandParams: {} },
        manifest.contributes ?? {},
      ),
      /* Absolute path to the app's browser half. The OS serves it under
         /desktop/plugins/<id>/ without copying or bundling anything, so
         uninstalling the plugin removes the route with the registration. */
      clientRoot: manifest.clientRoot ?? null,
      clientEntry: manifest.clientEntry ?? "app.js",
    };

    const dispose = this.ctx.effect(() => {
      this.registry.set(id, entry);
      if (typeof invoke === "function") this.handlers.set(id, invoke);
      this._record({ appId: id, verb: "install", target: id, actor: "system", summary: entry.name + " registered" });
      return () => {
        this.registry.delete(id);
        this.handlers.delete(id);
        this._record({ appId: id, verb: "delete", target: id, actor: "system", summary: entry.name + " unregistered" });
      };
    }, "magnaOS.registerApp()");

    this.disposers.set(id, dispose);
    if (manifest.pkg) this.pkgToApp.set(manifest.pkg, id);

    /* The disposer carries the app's own scoped handle. An app never calls the
       bare `observe` — it calls this one, which stamps `appId` from the
       registration rather than from the argument. Attribution the caller can
       set is attribution a marketplace plugin can forge, and a brain built on
       forgeable attribution is worse than no brain: it is confidently wrong
       about who did what. */
    dispose.scope = this.scopeFor(id);
    return dispose;
  }

  /**
   * The per-app handle. This is what an app plugin is handed; it cannot reach
   * the registry, and it cannot claim to be another app.
   * @param appId {string}
   */
  scopeFor(appId) {
    const self = this;
    return {
      appId: appId,
      observe(action) {
        return self._record({
          appId: appId,                      /* stamped, never taken from the caller */
          verb: action && action.verb,
          target: action && action.target,
          summary: action && action.summary,
          sessionId: action && action.sessionId,
          /* Passed through now. The previous version listed fields explicitly
             and therefore silently dropped anything an app tried to attach —
             including the entity keys the brain is built on. */
          actor: action && action.actor,
          entities: action && action.entities,
        });
      },
      invoke(otherAppId, command, args) { return self.invoke(otherAppId, command, args); },
      apps() { return self.apps(); },
    };
  }

  /**
   * Drop an app from the running desktop straight away.
   *
   * Removing a plugin edits the profile, which decides what the NEXT boot
   * composes — the running process keeps its tree. Without this the app stays
   * in the dock and its window still opens, which reads as "the uninstall did
   * not work". Running its disposer takes the dock entry, the desktop icon and
   * the asset route now; the agent tools it registered belong to its own plugin
   * fiber and clear on restart.
   */
  unregisterApp(appId) {
    const dispose = this.disposers.get(appId);
    if (!dispose) return false;
    this.disposers.delete(appId);
    try { dispose(); } catch (e) { return false; }
    return true;
  }

  /** appId for a package name, if that package registered one. */
  appIdForPackage(pkg) {
    return this.pkgToApp.get(pkg) || null;
  }

  /** Where an app's browser half lives on disk, or null if it ships none. */
  clientRootFor(appId) {
    const entry = this.registry.get(appId);
    return entry ? entry.clientRoot : null;
  }

  /** @returns {object[]} the installed apps, in placement order. */
  apps() {
    return [...this.registry.values()].sort((a, b) => a.placement.order - b.placement.order);
  }

  /* ---- the action bus -------------------------------------------------- */

  /**
   * Record one action. This is the human-side half of the brain — the agent
   * side arrives for free on `session/event`, but nothing a person does in the
   * OS reaches the model unless it comes through here.
   *
   * @param action {object} appId, verb, target, summary, sessionId
   */
  observe(action) {
    return this._record(action ?? {});
  }

  /** The single write path for an action. Everything funnels here so there is
   *  one place that decides shape, bounds and notification. */
  _record(action) {
    const at = Date.now();
    const record = {
      /* An id, so an action can be cited later. Without one, "why did you say
         that" can only point at a timestamp. */
      id: "a" + at.toString(36) + "-" + (this.seq = (this.seq || 0) + 1).toString(36),
      at,
      /* Who acted. This matters more than it looks: without it the brain cannot
         tell work the user chose from work it suggested, and the prediction
         counters end up reinforcing their own guesses. */
      actor: action.actor === "agent" || action.actor === "system" ? action.actor : "human",
      appId: action.appId ?? "os",
      verb: action.verb ?? "run",
      target: action.target ?? null,
      summary: action.summary ?? "",
      /* Canonical entity keys touched by this action — the join that makes
         "coding, then email, then the PO" one story rather than three. */
      entities: Array.isArray(action.entities) ? action.entities.slice(0, 12) : [],
      sessionId: action.sessionId ?? null,
    };
    this._push(this.recentActions, record);
    this._notify();
    return record;
  }

  /**
   * Called by the plugin's session tap. Kept separate from `observe` so the
   * two halves of the brain stay distinguishable in every view.
   */
  observeSessionEvent(sessionId, type) {
    this._push(this.recentEvents, { sessionId: sessionId, type: type, at: Date.now() });
    this._notify();
  }

  /** Live view for the desktop and the health surface. */
  snapshot() {
    return {
      apps: this.apps(),
      actions: this.recentActions.slice(-40).reverse(),
      events: this.recentEvents.slice(-40).reverse(),
      counts: {
        apps: this.registry.size,
        actions: this.recentActions.length,
        events: this.recentEvents.length,
      },
    };
  }

  /** Subscribe to registry/action changes. Returns an unsubscribe function. */
  watch(fn) {
    this.watchers.add(fn);
    return () => this.watchers.delete(fn);
  }

  /* ---- the command bus ------------------------------------------------- */

  /**
   * Ask an app to do something. The same surface the `os_*` agent tools call,
   * so a person clicking a button and the model calling a tool travel exactly
   * one path — which is what keeps both observable.
   */
  async invoke(appId, command, args, opts) {
    /* Reserved: an app's browser half announces through the same endpoint it
       uses for commands, so the OS answers this one itself rather than passing
       a pseudo-command into the app's switch. The appId is taken from the
       route, never from the body. */
    if (command === "__observe") {
      if (!this.registry.has(appId)) {
        throw new Error('magnaOS.observe: "' + appId + '" is not installed');
      }
      return this.scopeFor(appId).observe(args || {});
    }
    const handler = this.handlers.get(appId);
    if (!handler) {
      throw new Error('magnaOS.invoke: "' + appId + '" is not installed, or registered no command handler');
    }
    const result = await handler(command, args ?? {});
    /* Reads are not actions.
       Every app polls its own data — Docs and Sheets every 2s, Brain every 8s —
       and recording those made the journal 98% machinery: 492 of 500 entries
       were `invoked list` / `invoked used` / `invoked apps`, at a median 141ms
       apart. A brain built on that learns that the user polls. An app declares
       which of its commands only read, and those are not journalled. */
    const entry = this.registry.get(appId);
    const readOnly = entry && Array.isArray(entry.contributes.readOnly)
      ? entry.contributes.readOnly.indexOf(command) >= 0
      : false;
    if (!readOnly) {
      this.observe({
        appId: appId, verb: "run", target: command,
        summary: "invoked " + command,
        actor: opts && opts.actor,
        entities: opts && opts.entities,
      });
    }
    return result;
  }

  /* ---- internals ------------------------------------------------------- */

  _push(buf, item) {
    buf.push(item);
    const limit = this.config.recentLimit ?? 200;
    if (buf.length > limit) buf.splice(0, buf.length - limit);
  }

  _notify() {
    for (const fn of this.watchers) {
      try { fn(); } catch { /* a broken watcher must not take the OS down */ }
    }
  }
}
