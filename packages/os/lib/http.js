import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
};

function sendJson(res, status, value) {
  res.writeHead(status, { "content-type": MIME[".json"], "cache-control": "no-store" });
  res.end(JSON.stringify(value, null, 2));
}

function readBody(req, limit = 1 << 20) {
  return new Promise((ok, fail) => {
    let size = 0;
    const parts = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { fail(new Error("body too large")); req.destroy(); return; }
      parts.push(c);
    });
    req.on("end", () => ok(Buffer.concat(parts).toString("utf8")));
    req.on("error", fail);
  });
}

/** Serve one file from a root, refusing anything that escapes it. */
async function serveFrom(root, rel, req, res) {
  const target = resolve(normalize(join(root, rel)));
  if (target !== root && !target.startsWith(root + sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const body = await readFile(target);
    res.writeHead(200, {
      "content-type": MIME[extname(target)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  }
}

/**
 * Build the `/desktop` request handler.
 *
 * Serving the desktop from inside dsh is the entire architectural move: the
 * page ends up on the same origin as `/api`, so the trust fence that returns a
 * hard 403 to a cross-origin caller is satisfied by construction rather than
 * worked around. `/api` is itself just a registered prefix route, so this one
 * is exactly as legitimate.
 *
 * @param opts {{root:string, mount:string, os:object}}
 */
export function createDesktopHandler(opts) {
  const root = resolve(opts.root);
  const mount = opts.mount;
  const os = opts.os;
  /* The MagnaVERSE Console lives in the repo, not in this package. Serving it
     under `<mount>/console/` is not cosmetic: the file references its sibling
     apps relatively ("app-docs.html") and Monaco as "../vendor/monaco/". At
     that exact depth both resolve correctly — to <mount>/console/app-docs.html
     and <mount>/vendor/monaco — so the 976 KB file is served byte-for-byte
     with no edits at all. One level up or down and both break. */
  const consoleRoot = opts.consoleRoot ? resolve(opts.consoleRoot) : null;

  return async function handle(req, res) {
    const url = new URL(req.url ?? "/", "http://localhost");

    /* Decode BEFORE the containment check, not after. Serving the raw encoded
       string happens to be safe — "%2e%2e%2f" is not a real directory, so it
       just 404s — but it is safe by accident, and it breaks any legitimate file
       whose name contains a space or a non-ASCII character. Decoding first
       means the guard below sees the same path the filesystem will. */
    let rel;
    try {
      rel = decodeURIComponent(url.pathname).slice(mount.length);
    } catch {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      res.end("bad request");
      return;
    }
    if (rel.startsWith("/")) rel = rel.slice(1);

    /* A decoded NUL truncates the path in some syscalls; refuse outright. */
    if (rel.includes("\0")) {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      res.end("bad request");
      return;
    }

    /* ---- the command bus ------------------------------------------------
       The browser's route into an installed app. Deliberately the same
       `magnaOS.invoke` the `os_invoke` agent tool calls: a click and a model
       both travel one path, which is what keeps them equally observable and
       stops the two drifting apart. */
    /* Install and removal change what the next boot composes. Kept POST-only
       and separate from the command bus so it can never be reached by an app
       pretending to be a command. */
    /* ---- app ingress ------------------------------------------------------
       `/desktop/hook/<appId>/<rest>` reaches an app that declared
       `contributes.ingress`. It exists so an app can accept an INBOUND call —
       a webhook firing a workflow, a mail provider pushing a notification —
       without every such app having to reach `ctx.webServer` itself, which is
       the layer-1 boundary apps are not supposed to cross.

       Deliberately NOT behind the same-origin fence the rest of `/desktop`
       relies on: a webhook that only accepted same-origin requests could only
       ever be called by the desktop itself, which is not a webhook. The
       authority here is the app's own secret, checked by the app — so an app
       that declares ingress owns its own authentication and the OS does not
       pretend to provide any. */
    if (rel.startsWith("hook/")) {
      const parts = rel.slice(5).split("/");
      const appId = parts.shift();
      const entry = os.apps().find((a) => a.id === appId);
      if (!entry || !entry.contributes.ingress) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("not found");
        return;
      }
      let body = "";
      try { body = await readBody(req); }
      catch { sendJson(res, 413, { ok: false, error: "body too large" }); return; }
      let parsed = null;
      try { parsed = body ? JSON.parse(body) : null; } catch { parsed = null; }
      try {
        const r = await os.invoke(appId, "__ingress", {
          path: parts.join("/"),
          method: req.method,
          query: Object.fromEntries(url.searchParams),
          headers: req.headers,
          body: parsed === null ? body : parsed,
          /* The socket's own view of the peer. Not taken from a header — an
             X-Forwarded-For a caller can set is not an identity. */
          remote: req.socket ? req.socket.remoteAddress : null,
        }, { actor: "system" });
        sendJson(res, (r && r.status) || 200, (r && r.body) !== undefined ? r.body : { ok: true });
      } catch (e) {
        sendJson(res, 400, { ok: false, error: e.message });
      }
      return;
    }

    if (rel === "__os/market/install" || rel === "__os/market/remove") {
      if (req.method !== "POST") { res.writeHead(405, { allow: "POST" }); res.end(); return; }
      let body;
      try { body = JSON.parse(await readBody(req)); }
      catch (e) { sendJson(res, 400, { ok: false, error: "invalid JSON" }); return; }
      const action = rel.endsWith("install") ? "add" : "remove";
      try {
        const r = await os.market.mutate(action, body.target);
        os.observe({
          appId: "market", verb: action === "add" ? "install" : "delete",
          target: body.target, summary: (action === "add" ? "installed " : "removed ") + body.target,
        });
        sendJson(res, r.ok ? 200 : 400, r);
      } catch (e) { sendJson(res, 400, { ok: false, message: e.message }); }
      return;
    }

    if (rel === "__os/invoke") {
      if (req.method !== "POST") {
        res.writeHead(405, { allow: "POST" });
        res.end();
        return;
      }
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch (e) {
        sendJson(res, 400, { ok: false, error: "invalid JSON: " + e.message });
        return;
      }
      try {
        const result = await os.invoke(body.appId, body.command, body.args || {});
        sendJson(res, 200, { ok: true, result: result === undefined ? null : result });
      } catch (e) {
        sendJson(res, 400, { ok: false, error: e.message });
      }
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { allow: "GET, HEAD" });
      res.end();
      return;
    }

    /* The health surface. Deliberately under the mount rather than at the
       server root: a plugin owns its own namespace and nothing outside it. */
    if (rel === "__os/state") { sendJson(res, 200, os.snapshot()); return; }
    if (rel === "__os/market") {
      try { sendJson(res, 200, { items: await os.market.list() }); }
      catch (e) { sendJson(res, 500, { items: [], error: e.message }); }
      return;
    }
    if (rel === "__os/apps") { sendJson(res, 200, { apps: os.apps() }); return; }

    /* ---- layer 3 assets -------------------------------------------------
       Each installed app serves its browser half from its own package
       directory, under its own id. The OS never copies or bundles those files;
       it just knows where they are, so uninstalling the plugin takes the route
       away with everything else. */
    if (rel.startsWith("plugins/")) {
      const rest = rel.slice("plugins/".length);
      const slash = rest.indexOf("/");
      const appId = slash === -1 ? rest : rest.slice(0, slash);
      const file = slash === -1 ? "" : rest.slice(slash + 1);
      const clientRoot = os.clientRootFor(appId);
      if (!clientRoot || !file) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("not found");
        return;
      }
      await serveFrom(resolve(clientRoot), file, req, res);
      return;
    }

    /* ---- the Console ----------------------------------------------------
       `/desktop` redirects rather than serving, because a page served at a
       path with no trailing slash resolves its relative URLs against the
       parent — every "app-docs.html" would become "/app-docs.html" and fall
       through to the harness SPA fallback as HTML. */
    if (consoleRoot) {
      if (rel === "" || rel === "console") {
        res.writeHead(302, { location: mount + "/console/" });
        res.end();
        return;
      }
      if (rel === "console/" || rel === "console/index.html") {
        await serveFrom(join(consoleRoot, "apps"), "app-7-console.html", req, res);
        return;
      }
      if (rel.startsWith("console/")) {
        await serveFrom(join(consoleRoot, "apps"), rel.slice("console/".length), req, res);
        return;
      }
      if (rel.startsWith("vendor/")) {
        await serveFrom(join(consoleRoot, "vendor"), rel.slice("vendor/".length), req, res);
        return;
      }
      if (rel.startsWith("assets/")) {
        await serveFrom(join(consoleRoot, "assets"), rel.slice("assets/".length), req, res);
        return;
      }
    }

    if (rel === "" || rel === "index.html") rel = "index.html";
    if (rel === "shell" || rel === "shell/") rel = "index.html";
    await serveFrom(root, rel, req, res);
  };
}
