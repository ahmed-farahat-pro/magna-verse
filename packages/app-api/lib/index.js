import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";

/**
 * API Studio — a layer-3 app plugin.
 *
 * The Console's version had three collections — Magna Internal, SAP Bridge,
 * P6 Bridge — whose responses came from an `API_RESPONSES` object keyed by
 * request id. Pressing Send looked up a canned body and printed an invented
 * `200 OK · 142 ms · 1.9 KB`. Nothing was ever sent, and the endpoints it
 * offered do not exist.
 *
 * This sends the request. The status, the duration, the byte count and the body
 * are all measured or received. If a host does not resolve you get the DNS
 * error, not a green 200.
 *
 * Requests run on the HOST rather than in the browser on purpose: the browser
 * is subject to CORS, so a request to any API that does not opt in would fail
 * for a reason that has nothing to do with the API. From here it behaves like
 * curl, which is what an API client is for.
 *
 * @module @magna/app-api
 */

export const name = "magna-app-api";
export const inject = ["magnaOS", "storageDomain"];

const HERE = dirname(fileURLToPath(import.meta.url));

/** Bound on a captured body. An API client must not be a memory exhaustion tool. */
const MAX_BODY = 2 * 1024 * 1024;

const Header = z.object({ k: z.string(), v: z.string(), on: z.boolean().default(true) });

const Request = z.object({
  id: z.string(),
  name: z.string().default(""),
  collection: z.string().default("Saved"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]).default("GET"),
  url: z.string().default(""),
  params: z.array(Header).default([]),
  headers: z.array(Header).default([]),
  auth: z.object({
    kind: z.enum(["none", "bearer", "basic", "header"]).default("none"),
    token: z.string().default(""),
    user: z.string().default(""),
    pass: z.string().default(""),
    headerName: z.string().default("X-API-Key"),
  }).default({}),
  body: z.string().default(""),
  bodyType: z.enum(["none", "json", "text", "form"]).default("none"),
  created: z.number(),
  modified: z.number(),
});

const SPEC = {
  name: "magna_api",
  version: 1,
  tables: { requests: { valueSchema: Request } },
};

let seq = 0;
const nextId = (p) => p + Date.now().toString(36) + "-" + (++seq).toString(36);

export async function apply(ctx) {
  const os = ctx.magnaOS;

  let domain = null;
  try { domain = await ctx.storageDomain.open(SPEC); }
  catch (e) { console.error("[app-api] durable storage unavailable: " + e.message); }
  const table = domain ? domain.table("requests") : null;
  const mem = new Map();

  ctx.effect(() => () => { if (domain) domain.close().catch(() => {}); }, "app-api: close storage domain");

  const all = () => (table ? [...table.entries()].map(([, r]) => r) : [...mem.values()]);
  const put = (r) => (table ? table.put(r.id, r) : Promise.resolve(mem.set(r.id, r)));
  const del = (id) => (table ? table.delete(id) : Promise.resolve(mem.delete(id)));
  const one = (id) => (table ? table.get(id) : mem.get(id));

  /** Build the final URL, so what is sent is what the UI showed. */
  function buildUrl(req) {
    const raw = String(req.url || "").trim();
    if (!raw) throw new Error("api: no URL");
    /* A bare host is the commonest thing to type; assume https rather than
       failing, and never assume http. */
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : "https://" + raw;
    let u;
    try { u = new URL(withScheme); }
    catch { throw new Error('api: "' + raw + '" is not a valid URL'); }
    for (const p of req.params || []) {
      if (p.on === false || !p.k) continue;
      u.searchParams.set(p.k, p.v == null ? "" : String(p.v));
    }
    return u;
  }

  function buildHeaders(req) {
    const h = {};
    for (const x of req.headers || []) {
      if (x.on === false || !x.k) continue;
      h[x.k] = x.v == null ? "" : String(x.v);
    }
    const a = req.auth || {};
    if (a.kind === "bearer" && a.token) h.authorization = "Bearer " + a.token;
    else if (a.kind === "basic" && (a.user || a.pass)) {
      h.authorization = "Basic " + Buffer.from(String(a.user) + ":" + String(a.pass)).toString("base64");
    } else if (a.kind === "header" && a.token) h[a.headerName || "X-API-Key"] = a.token;

    if (req.bodyType === "json" && !Object.keys(h).some((k) => k.toLowerCase() === "content-type")) {
      h["content-type"] = "application/json";
    }
    if (req.bodyType === "form" && !Object.keys(h).some((k) => k.toLowerCase() === "content-type")) {
      h["content-type"] = "application/x-www-form-urlencoded";
    }
    return h;
  }

  async function send(req) {
    const u = buildUrl(req);
    const method = String(req.method || "GET").toUpperCase();
    const headers = buildHeaders(req);
    const hasBody = method !== "GET" && method !== "HEAD" && req.bodyType !== "none";

    if (req.bodyType === "json" && hasBody && String(req.body || "").trim()) {
      /* Caught here rather than at the server, so the error names the problem
         instead of arriving as a 400 from someone else's API. */
      try { JSON.parse(req.body); }
      catch (e) { throw new Error("api: the JSON body is not valid — " + e.message); }
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 60000);
    const started = Date.now();
    let res;
    try {
      res = await fetch(u.toString(), {
        method, headers,
        body: hasBody ? String(req.body || "") : undefined,
        redirect: "follow",
        signal: ac.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const ms = Date.now() - started;
      /* A transport failure is a real outcome and is reported as one, with the
         cause named. The screen this replaces could only ever show 200. */
      throw new Error(describeFetchError(e, u) + " (after " + ms + "ms)");
    }
    clearTimeout(timer);

    const buf = Buffer.from(await res.arrayBuffer());
    const ms = Date.now() - started;
    const text = buf.subarray(0, MAX_BODY).toString("utf8");
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON, which is fine */ }

    os.observe({
      appId: "api", verb: "run", target: u.origin + u.pathname,
      summary: method + " " + u.origin + u.pathname + " → " + res.status + " in " + ms + "ms",
      actor: "human",
    });

    return {
      status: res.status,
      statusText: res.statusText || "",
      ok: res.ok,
      ms,
      bytes: buf.length,
      truncated: buf.length > MAX_BODY,
      /* The final URL after redirects, which is not always what was typed. */
      url: res.url || u.toString(),
      headers: Object.fromEntries(res.headers.entries()),
      body: text,
      json,
    };
  }

  async function invoke(command, args) {
    switch (command) {
      case "list":
        return {
          requests: all().sort((a, b) => b.modified - a.modified),
          durable: !!domain,
        };

      case "read": {
        const r = one(args.id);
        if (!r) throw new Error('api: no request "' + args.id + '"');
        return r;
      }

      case "save": {
        const now = Date.now();
        const prev = args.id ? one(args.id) : null;
        const r = Request.parse({
          id: args.id || nextId("req"),
          name: String(args.name || "").slice(0, 120),
          collection: String(args.collection || "Saved").slice(0, 60),
          method: args.method || "GET",
          url: String(args.url || ""),
          params: args.params || [],
          headers: args.headers || [],
          auth: args.auth || {},
          body: String(args.body || ""),
          bodyType: args.bodyType || "none",
          created: prev ? prev.created : now,
          modified: now,
        });
        await put(r);
        return { id: r.id, name: r.name };
      }

      case "remove": {
        if (!one(args.id)) throw new Error('api: no request "' + args.id + '"');
        await del(args.id);
        return { deleted: args.id };
      }

      /* Send is not read-only: it leaves the machine and may change something
         at the other end. It belongs in the journal. */
      case "send":
        return send(args);

      default:
        throw new Error('api: unknown command "' + command + '"');
    }
  }

  os.registerApp({
    id: "api",
    name: "API Studio",
    publisher: "Magna",
    version: "0.1.0",
    pkg: "@magna/app-api",
    icon: "i-api",
    tile: "g-api",
    window: { w: 1020, h: 660, minW: 560, minH: 400, multi: false },
    placement: { dock: true, desktop: true, order: 70 },
    aliases: ["api", "rest", "http", "postman", "studio"],
    /* Declared honestly: this app exists to make network requests. The
       Connections screen reads this manifest, so understating it there would
       understate the machine's egress surface. */
    permissions: { grant: ["api:read", "net:egress"], deny: ["fs:write"] },
    contributes: {
      tools: [],
      commands: ["list", "read", "save", "remove", "send"],
      readOnly: ["list", "read"],
    },
    clientRoot: resolve(HERE, "..", "client"),
    clientEntry: "app.js",
  }, invoke);

  console.log("[app-api] layer 3 registered - real HTTP, " + all().length + " saved request(s)");
}

/** Name the transport failure instead of printing "fetch failed". */
function describeFetchError(e, u) {
  const cause = e.cause || {};
  const code = cause.code || e.code;
  if (e.name === "AbortError") return "The request timed out after 60s";
  if (code === "ENOTFOUND") return "No host found at " + u.hostname;
  if (code === "ECONNREFUSED") return "Connection refused by " + u.host;
  if (code === "ECONNRESET") return "The connection was reset by " + u.host;
  if (code === "CERT_HAS_EXPIRED") return "The TLS certificate for " + u.hostname + " has expired";
  if (code === "DEPTH_ZERO_SELF_SIGNED_CERT" || code === "SELF_SIGNED_CERT_IN_CHAIN") {
    return "The TLS certificate for " + u.hostname + " is self-signed";
  }
  if (code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") return "The TLS certificate for " + u.hostname + " could not be verified";
  return (cause.message || e.message || "The request failed") + " (" + u.host + ")";
}
