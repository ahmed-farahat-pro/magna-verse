import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { MagnaOS } from "./registry.js";
import { createDesktopHandler } from "./http.js";
import { registerOsTools } from "./tools.js";
import { wireBrain } from "./brain.js";
import { catalogue, mutatePlugin } from "./market.js";
import { actionFromEvent } from "./capture.js";

/**
 * @deepseek-ai/dsh plugin — MagnaVERSE OS, layer 2.
 *
 * Claims `ctx.magnaOS`, serves the desktop at `/desktop`, and taps the session
 * event stream. App plugins sit above this and inject `magnaOS`, so Cordis
 * holds them until the service exists.
 *
 * Dependency note: this package imports `@deepseek-ai/cordis` and nothing else
 * from the harness, on purpose. `dsh plugin add` of a local directory installs
 * it with pnpm's `link:` protocol, so the package stays where it is on disk and
 * Node resolves its imports by walking up from THERE — it never reaches the
 * profile's module farm. `scripts/link-harness.sh` bridges that gap by linking
 * the harness's own copy in, which also keeps cordis a single instance: two
 * copies would mean two `Service` base classes and a registry that silently
 * fails to match. Every extra import is another link to maintain, so config is
 * validated by hand below rather than pulling in a schema library.
 *
 * @module @magna/os
 */

/** Stable Cordis plugin name. */
export const name = "magna-os";

/**
 * `webServer` is the only hard requirement — without somewhere to serve the
 * desktop there is nothing to load. The session tap needs no injection: it is
 * an event subscription, and a listener on a plain host context receives every
 * session rather than only those entered through one agent.
 */
export const inject = ["webServer", "tools", "systemPrompt"];

/**
 * Harness services an app may read THROUGH the OS.
 *
 * Apps do not reach layer 1 directly — that boundary is what makes them
 * replaceable and their activity observable. But a systems app like the
 * marketplace legitimately needs to show what skills and subagents exist, so
 * the OS offers a narrow read-only window onto them rather than each app
 * injecting harness services for itself.
 */
function harnessSurface(ctx) {
  const get = (k) => { try { return ctx.get ? ctx.get(k) : null; } catch { return null; } };
  return {
    async skills(sessionId) {
      const svc = get("skills");
      if (!svc || !sessionId) return { available: !!svc, skills: [] };
      try {
        const list = await svc.list({ sessionId });
        return { available: true, skills: list.skills || list || [] };
      } catch (e) { return { available: true, skills: [], error: e.message }; }
    },
    async subagents(parentSessionId) {
      const svc = get("subagents");
      if (!svc) return { available: false, entries: [] };
      try {
        const r = await svc.list ? await svc.list({ parentSessionId }) : { entries: [] };
        return { available: true, entries: r.entries || [] };
      } catch (e) { return { available: true, entries: [], error: e.message }; }
    },
    async models() {
      const svc = get("llm");
      if (!svc) return { available: false, groups: [] };
      try { return { available: true, groups: (await svc.models?.()) || [] }; }
      catch (e) { return { available: true, groups: [], error: e.message }; }
    },
    /* Said plainly rather than shown as an empty list: the scheduler is not
       mounted in this profile, so there are no automations to list — which is
       different from having none. */
    schedule() {
      return { available: !!get("schedule"), entries: [] };
    },
  };
}

const DEFAULTS = {
  mount: "/desktop", logEvents: true, recentLimit: 200,
  consoleRoot: null,
  profile: "web",
  dshBin: null,
};

/**
 * Validate and fill the plugin config.
 * @param raw {object=} the row's `config` block from the composition.
 */
function readConfig(raw) {
  const c = Object.assign({}, DEFAULTS, raw ?? {});
  if (typeof c.mount !== "string" || !c.mount.startsWith("/")) {
    throw new TypeError('magna-os: config.mount must be an absolute path, got ' + JSON.stringify(c.mount));
  }
  if (c.mount.length < 2 || c.mount.endsWith("/")) {
    throw new TypeError('magna-os: config.mount must name a directory without a trailing slash, got ' + JSON.stringify(c.mount));
  }
  c.logEvents = !!c.logEvents;
  c.recentLimit = Number.isInteger(c.recentLimit) && c.recentLimit > 0 ? c.recentLimit : DEFAULTS.recentLimit;
  return c;
}

const HERE = dirname(fileURLToPath(import.meta.url));

/** Where this profile's package.json lives — the record of what is installed. */
function profileDir(ctx, config) {
  let home = null;
  try {
    const v = ctx.get ? ctx.get("dshHomePath") : null;
    home = typeof v === "string" ? v : (v && v.path) || null;
  } catch { /* not mounted */ }
  /* DSH_HOME is only set when the harness was launched with it. Left unset,
     the harness itself defaults to ~/.dsh — so falling back to null here meant
     the profile was never found on a normal launch, and every app read as
     "available" while nine were running. */
  home = home || process.env.DSH_HOME || resolve(homedir(), ".dsh");
  return home ? resolve(home, "profiles", config.profile || "web") : null;
}

/**
 * @param ctx Cordis context that owns the service and every registration.
 * @param raw the row's config block.
 */
export function apply(ctx, raw = {}) {
  const config = readConfig(raw);
  const os = new MagnaOS(ctx, config);
  os.harness = harnessSurface(ctx);

  /* ---- the desktop surface ---------------------------------------------
     Registered through ctx.effect, so unloading this plugin takes the route
     with it. Nothing has to remember to unregister. */
  /* Plugins mounted live, without a restart.
     `dsh plugin add` edits the profile, which decides what the NEXT boot
     composes — so an install used to leave the user staring at "restart the
     harness to finish the job". But an app plugin is just {name, inject, apply}
     and Cordis can mount one at runtime: ctx.plugin() returns a disposable
     fiber. So the OS imports the package and mounts it itself, and the profile
     edit becomes the thing that makes it survive the next boot rather than the
     thing that makes it work. */
  const liveFibers = new Map();     /* package name -> fiber */

  /* Apps are mounted by the OS, not by the harness loader.
     They used to be profile rows, which meant the loader owned their fibers —
     so removing one could dispose its window but never its tools, and the next
     install collided with the half of itself that was still there. Owning the
     fiber is what makes remove and install symmetrical, and it is the layering
     the rest of this design already claims: the OS owns layer 3.
     `dsh plugin add` still records the install in the profile dependencies;
     that is now what makes it survive a reboot, not what makes it work. */

  async function mountLive(pkgName, dir) {
    if (liveFibers.has(pkgName)) return { ok: true, already: true };
    const entry = pathToFileURL(join(dir, "lib", "index.js")).href;
    /* Cache-bust: a re-install after a remove must not get the module the
       loader already resolved, or code changes never take effect. */
    const mod = await import(entry + "?v=" + Date.now());
    const fiber = ctx.plugin(mod, {});
    await fiber;                    /* wait for apply() so registerApp has run */
    liveFibers.set(pkgName, fiber);
    return { ok: true };
  }

  function unmountLive(pkgName) {
    const fiber = liveFibers.get(pkgName);
    if (!fiber) return false;
    liveFibers.delete(pkgName);
    try { (fiber.dispose || fiber.stop || (() => {})).call(fiber); return true; }
    catch (e) { console.error("[magna-os] could not unmount " + pkgName + ":", e.message); return false; }
  }

  /* The marketplace runs the harness's own plugin command. Bound onto the
     service so the browser route, the agent tools and any future UI all reach
     one implementation. */
  os.market = {
    list: () => catalogue(config.consoleRoot, os.apps(), profileDir(ctx, config)),
    mutate: async (action, target) => {
      const items = await catalogue(config.consoleRoot, os.apps(), profileDir(ctx, config));

      /* Resolve the target ONCE, here, and hand both forms downstream.
         The browser sends a directory (`item.dir`); the profile, `unmountLive`
         and `appIdForPackage` are all keyed by PACKAGE NAME. Comparing the two
         directly is why removal silently did nothing for so long: the
         "is it installed?" guard tested a path against a list of package names,
         never matched, and returned `noop: true` — so the plugin command never
         ran, the fiber was never disposed, and the app kept working while the
         UI reported success. */
      const item = items.filter((i) => i.dir === target || i.pkg === target)[0] || null;
      const pkgName = item ? item.pkg : target;

      const r = await mutatePlugin({
        repoRoot: config.consoleRoot,
        profile: config.profile,
        dshBin: config.dshBin,
        installedPackages: items.filter((i) => i.inProfile).map((i) => i.pkg),
        action, target, pkgName,
      });
      if (r.ok && action === "remove" && !r.noop) {
        /* Dispose the whole plugin fiber if we mounted it live — that takes its
           tools with it, not just its window. Fall back to unregistering the
           app for plugins the loader mounted at boot. */
        const disposed = unmountLive(pkgName);
        const appId = os.appIdForPackage(pkgName);
        if (appId) os.unregisterApp(appId);
        /* A live disposal needs no restart, and saying otherwise sends people
           to restart a harness that is already correct. */
        r.restartRequired = !disposed;
        r.message = disposed
          ? "Removed. Gone completely — window, assets and its agent tools."
          : "Removed. The app is gone from your desktop; its agent tools clear on the next restart.";
      }

      if (r.ok && action === "add") {
        const items = await catalogue(config.consoleRoot, os.apps(), profileDir(ctx, config));
        const item = items.filter((i) => i.dir === r.target || i.pkg === r.target)[0];
        if (item) {
          try {
            await mountLive(item.pkg, item.dir);
            r.live = true;
            r.restartRequired = false;
            r.message = "Installed and running. Open it now.";
          } catch (e) {
            /* Say what actually happened rather than claiming success. The
               profile edit stands, so a restart still fixes it. */
            r.live = false;
            r.message = "Installed, but could not start it live (" + e.message +
                        "). Restart the harness to load it.";
          }
        }
      }
      return r;
    },
  };

  const handler = createDesktopHandler({
    root: resolve(HERE, "..", "public"),
    mount: config.mount,
    consoleRoot: config.consoleRoot,
    os,
  });
  ctx.effect(
    () => ctx.webServer.register({ kind: "prefix", path: config.mount, handler }),
    "magna-os: " + config.mount + " route",
  );

  /* ---- the agent's hands ------------------------------------------------
     The other direction: layer 2 contributing capability down into layer 1, so
     the model can drive the desktop through the same call path a click takes. */
  registerOsTools(ctx, os);

  /* ---- the brain tap ----------------------------------------------------
     One listener, total observability. Every tool call, message, approval and
     turn boundary in every session arrives here, because every durable fact in
     dsh goes through session.append and this fires on all of them. */
  ctx.effect(() => {
    const off = ctx.on("session/event", (session, event) => {
      const type = (event && event.type) || "unknown";
      const sessionId = (session && session.id) || null;
      os.observeSessionEvent(sessionId, type);

      /* The agent half of the brain. This used to keep only the event TYPE and
         drop `event.data`, so every tool name, argument, approval outcome and
         message went on the floor — the single largest gap in the system.
         `actionFromEvent` projects the events worth remembering onto the same
         envelope human actions use, so both halves are one stream. */
      try {
        const action = actionFromEvent(session, event);
        if (action) os.observe(action);
      } catch (e) {
        /* A malformed event must never take the tap down — losing the listener
           would silently stop the brain for the rest of the process. */
        console.error("[magna-os] capture failed for " + type + ":", e.message);
      }

      if (config.logEvents) {
        console.log("[magna-os] session/event  " + String(sessionId).slice(0, 8) + "  " + type);
      }
    });
    return () => { if (typeof off === "function") off(); };
  }, "magna-os: session/event tap");

  /* ---- the brain --------------------------------------------------------
     The agent half is already running above. This adds the human half and the
     channel that puts both in front of the model. */
  const brain = wireBrain(ctx, os, config);
  os.brain = brain;

  /* Mount everything the profile says is installed. Failures are reported per
     app rather than taking the desktop down with them. */
  ctx.effect(() => {
    let cancelled = false;
    (async () => {
      const items = await catalogue(config.consoleRoot, os.apps(), profileDir(ctx, config));
      for (const item of items) {
        if (cancelled || !item.inProfile) continue;
        try { await mountLive(item.pkg, item.dir); }
        catch (e) { console.error("[magna-os] " + item.pkg + " failed to mount:", e.message); }
      }
      console.log("[magna-os] mounted " + liveFibers.size + " app plugin(s)");
    })();
    return () => {
      cancelled = true;
      for (const pkg of [...liveFibers.keys()]) unmountLive(pkg);
    };
  }, "magna-os: app plugins");

  /* Stage 0 boot line — the one signal that says the layer is up. */
  console.log("[magna-os] layer 2 up — desktop at " + config.mount + ", watching every session");
  os.observe({ appId: "os", verb: "open", target: config.mount, actor: "system", summary: "MagnaVERSE OS mounted" });
}

export { MagnaOS };
