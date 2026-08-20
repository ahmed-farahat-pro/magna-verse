import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { CONNECTORS, describe, IDS } from "./connectors.js";

/**
 * Connections — a layer-3 app plugin.
 *
 * The Console's version listed ten enterprise systems — GitHub, GitLab, SAP
 * S/4HANA, Primavera P6, Jira, Confluence, Outlook, SharePoint, ServiceNow,
 * Teams — six of them marked "linked", with green ticks and repository counts.
 * At the bottom it admitted, in smaller type, that none of it was real: "no
 * OAuth handshake happens and no token is stored."
 *
 * For a product whose entire claim is sovereignty, a screen that invents six
 * live integrations is the worst possible thing to fake. The question this
 * screen answers — *what can reach outside this machine, and where does it go?*
 * — is the one question a sovereignty product must never guess at.
 *
 * So every row here is derived from something the harness can actually observe:
 *
 *   - model providers, from `ctx.llm.listProviders()`, split by whether the
 *     endpoint is on this machine or somewhere else;
 *   - the mailbox, from the Mail plugin's own state, if it is installed;
 *   - installed apps that DECLARE `net:egress` in their manifest;
 *   - and, named explicitly, the things that are not connected at all.
 *
 * A connector that does not exist does not get a card.
 *
 * @module @magna/app-connections
 */

export const name = "magna-app-connections";

/**
 * All three are injected, and all three were checked against the composition
 * first — `llm` and `settings` are both inserted by the `dsh-base` bundle, so
 * neither can stall this plugin the way an unmounted service would.
 *
 * They are injected rather than read through `ctx.get` because Cordis refuses a
 * property that was not declared ("cannot get property without inject"), and
 * that refusal is silent at the call site: the first version of this screen
 * caught the throw, returned null, and reported every provider's residency as
 * "unknown" — which looked like a considered answer rather than a failure to
 * ask the question.
 */
export const inject = ["magnaOS", "llm", "settings", "credentials", "storageDomain"];

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * A connection, as stored.
 *
 * `secretRef` is the NAME of a credential, never its value — the token lives in
 * the harness credential store. `verifiedAt` is set only by a successful call
 * to the service, so "connected" always means "it answered", never "a form was
 * filled in".
 */
const Connection = z.object({
  id: z.string(),
  config: z.record(z.string(), z.string()).default({}),
  secretRef: z.string().default(""),
  account: z.string().default(""),
  displayName: z.string().default(""),
  verifiedAt: z.number(),
  lastError: z.string().nullable().default(null),
});

const SPEC = {
  name: "magna_connections",
  version: 1,
  tables: { connections: { valueSchema: Connection } },
};

/** Hosts that mean "this machine". Anything else leaves it. */
const LOCAL_HOST = /^(https?:\/\/)?(127\.0\.0\.1|localhost|\[?::1\]?|0\.0\.0\.0)(:|\/|$)/i;

function isLocalEndpoint(url) {
  if (!url) return null;                       /* unknown, and we say so */
  return LOCAL_HOST.test(String(url));
}

export async function apply(ctx) {
  const os = ctx.magnaOS;

  let domain = null;
  try { domain = await ctx.storageDomain.open(SPEC); }
  catch (e) { console.error("[app-connections] durable storage unavailable: " + e.message); }
  const table = domain ? domain.table("connections") : null;
  const mem = new Map();
  ctx.effect(() => () => { if (domain) domain.close().catch(() => {}); }, "app-connections: close domain");

  const getConn = (id) => (table ? table.get(id) : mem.get(id));
  const allConn = () => (table ? [...table.entries()].map(([, c]) => c) : [...mem.values()]);
  const putConn = (c) => (table ? table.put(c.id, c) : Promise.resolve(mem.set(c.id, c)));
  const dropConn = (id) => (table ? table.delete(id) : Promise.resolve(mem.delete(id)));

  const refFor = (id) => "MAGNA_CONN_" + id.toUpperCase().replace(/[^A-Z0-9]/g, "_");

  /**
   * Split a submitted form into public config and the single secret.
   *
   * The secret never joins `config`, which is what gets written to storage —
   * one careless spread is the difference between a stored reference and a
   * stored token, so the split happens once, here, rather than at each caller.
   */
  function splitFields(def, fields) {
    const config = {};
    let secret = "";
    for (const f of def.fields || []) {
      const v = fields[f.k] == null ? "" : String(fields[f.k]);
      if (f.secret) secret = v;
      else config[f.k] = v;
    }
    return { secret, config };
  }

  async function secretOf(conn) {
    if (!conn.secretRef) return "";
    const r = await ctx.credentials.resolve(conn.secretRef);
    if (!r || !r.value) throw new Error("The stored credential is missing. Connect again.");
    return r.value;
  }

  /**
   * One connector's row.
   *
   * The live probe runs only for connectors that are actually connected, and a
   * probe failure downgrades the row to an error rather than being swallowed —
   * a token revoked at the provider should show here, not the next time
   * somebody tries to use it.
   */
  async function connectorRow(id) {
    const def = CONNECTORS[id];
    const meta = describe(id);
    const conn = getConn(id);

    /* Microsoft is owned by the Mail app; report what Mail says rather than
       keeping a second copy of the same account. */
    if (def.tier === "elsewhere" && def.connectIn) {
      let connected = false, detail = def.blurb, account = "";
      try {
        const st = await os.invoke(def.connectIn.appId, "state", {}, { actor: "system" });
        connected = !!(st.connected && st.account && st.account.kind === "graph");
        if (connected) { account = st.account.address; detail = "Signed in as " + account + " · mail scopes only"; }
        else if (st.connected) detail = "A mailbox is connected, but over IMAP rather than Microsoft.";
      } catch { detail = "The " + def.connectIn.appId + " app is not installed."; }
      return { ...meta, state: connected ? "connected" : "available", account, detail };
    }

    if (!conn) return { ...meta, state: "available", detail: def.blurb };

    let detail = def.blurb, state = "connected", err = conn.lastError;
    try {
      const extra = def.probe ? await def.probe(conn.config, await secretOf(conn)) : {};
      detail = extra.detail || def.blurb;
      err = null;
    } catch (e) {
      state = "error";
      err = e.message;
      detail = e.message;
    }
    if (err !== conn.lastError) { conn.lastError = err; await putConn(conn); }
    return { ...meta, state, account: conn.account, displayName: conn.displayName,
             config: conn.config, verifiedAt: conn.verifiedAt, detail };
  }


  function optional(key) {
    try { return ctx.get ? ctx.get(key) : null; } catch { return null; }
  }

  /**
   * Find a provider's endpoint.
   *
   * `listProviders()` returns only `{id, name}` — no URL — so residency cannot
   * be read from it. `listConfigurableProviders()` does say WHERE the endpoint
   * is stored (`settingsNs` plus `settingsPath`), so the address is fetched
   * from settings at that path. When that fails the answer is "unknown", never
   * "local": rounding an unknown endpoint towards local is precisely how a
   * sovereignty claim becomes false.
   */
  function endpointOf(llm, providerId) {
    let dir = [];
    try { dir = llm.listConfigurableProviders() || []; } catch { return null; }
    const entry = dir.filter((d) => d.provider === providerId)[0];
    if (!entry) return null;
    const settings = ctx.settings;
    let node;
    try { node = settings.get(entry.settingsNs); } catch { return null; }
    for (const step of entry.settingsPath || []) {
      if (!node || typeof node !== "object") return null;
      node = node[step];
    }
    if (!node || typeof node !== "object") return null;
    /* `baseURL` — capital URL. The harness writes it that way and a lookup for
       `baseUrl` silently missed every configured endpoint, which reported the
       locally-hosted Ollama route as "residency unknown". */
    return node.baseURL || node.baseUrl || node.endpoint || node.url || node.host || null;
  }

  /** Model providers, and whether each one leaves the building. */
  async function providers() {
    const llm = ctx.llm;
    if (!llm) {
      return { available: false, rows: [] };
    }
    const rows = [];
    let list = [];
    try { list = llm.listProviders() || []; }
    catch (e) { return { available: true, error: e.message, rows: [] }; }

    for (const p of list) {
      const id = p.id || p.provider || p.name || String(p);
      let models = [];
      try { models = await llm.listModels(id); } catch { models = []; }
      const endpoint = endpointOf(llm, id);
      const local = isLocalEndpoint(endpoint);
      /* A route with no configured endpoint is not "unknown" — it is the
         adapter's shipped default, which for every hosted vendor is that
         vendor's own cloud. Calling that unknown would be technically cautious
         and practically misleading, and the safe direction to round is towards
         "this leaves the machine", never away from it. */
      const residency = local === null ? "external" : local ? "local" : "external";
      const count = models.length
        ? models.length + " model" + (models.length === 1 ? "" : "s")
        : "no models advertised";
      rows.push({
        id,
        kind: "model",
        title: p.name || id,
        endpoint: endpoint || null,
        residency,
        detail: endpoint ? count : count + " · no local endpoint configured, so it uses the provider's own cloud",
        state: models.length ? "connected" : "configured",
      });
    }
    return { available: true, rows };
  }

  /** The mailbox, asked of the Mail plugin rather than assumed. */
  async function mailbox() {
    const installed = os.apps().some((a) => a.id === "mail");
    if (!installed) {
      return [{
        id: "mail", kind: "mail", title: "Mail",
        residency: "external", detail: "The Mail app is not installed.",
        state: "absent", endpoint: null,
      }];
    }
    try {
      const st = await os.invoke("mail", "state", {}, { actor: "system" });
      if (!st.connected) {
        return [{
          id: "mail", kind: "mail", title: "Mail",
          residency: "external", detail: "No mailbox connected.",
          state: "available", endpoint: null,
        }];
      }
      const a = st.account;
      const viaGraph = a.kind === "graph";
      return [{
        id: "mail", kind: "mail",
        title: viaGraph ? "Microsoft 365" : "IMAP · " + (a.host || "mail server"),
        residency: "external",
        endpoint: viaGraph ? "graph.microsoft.com" : a.host,
        detail: a.address + (a.lastError ? " · " + a.lastError : a.lastSync ? " · last synced " + new Date(a.lastSync).toLocaleString() : " · never synced"),
        state: a.lastError ? "error" : "connected",
      }];
    } catch (e) {
      return [{
        id: "mail", kind: "mail", title: "Mail", residency: "external",
        detail: "Could not read the mail app: " + e.message, state: "error", endpoint: null,
      }];
    }
  }

  /**
   * Installed apps that declare egress.
   *
   * A declaration, not a measurement — the manifest says what an app is allowed
   * to do, and the card says so in those words. Claiming to have measured
   * traffic we have not measured would be the same failure as the screen this
   * replaces.
   */
  function appEgress(already) {
    const seen = new Set(already || []);
    return os.apps()
      .filter((a) => !seen.has(a.id))
      .filter((a) => {
        const g = (a.permissions && a.permissions.grant) || [];
        const d = (a.permissions && a.permissions.deny) || [];
        return g.indexOf("net:egress") >= 0 && d.indexOf("net:egress") < 0;
      })
      .map((a) => ({
        id: a.id, kind: "app", title: a.name,
        residency: "external",
        detail: "Declares net:egress in its manifest.",
        state: "connected", endpoint: null,
      }));
  }

  /**
   * What is deliberately NOT here.
   *
   * Named rather than omitted, because the honest answer to "is SAP connected?"
   * is "no, and nothing in this build can connect it" — not silence, and
   * certainly not a green tick.
   */
  const NOT_CONNECTED = [
    { title: "MCP servers", why: "No MCP client is mounted in this profile, so no MCP server can be configured." },
    { title: "SharePoint, Teams and OneDrive",
      why: "The Microsoft sign-in requests mail scopes only. These need extra Graph scopes and a wider consent than the Mail app asks for." },
    { title: "SAP S/4HANA and Primavera P6 as named connectors",
      why: "Both are reachable through the generic REST connector on the Connections tab, but there is no public instance to build a vendor-shaped one against — so nothing here pretends to know their schemas." },
  ];

  async function invoke(command, args) {
    switch (command) {
      /* The Connections tab: one row per connector, with live state. */
      case "connectors":
        return { connectors: await Promise.all(IDS.map(connectorRow)) };

      /**
       * Try a credential set WITHOUT storing it.
       *
       * Separate from `connect` so a wrong token is reported while the form is
       * still open. Nothing is written unless the service answers.
       */
      case "testConnector": {
        const def = CONNECTORS[args.id];
        if (!def || !def.verify) throw new Error("connections: nothing to test for " + args.id);
        const { secret, config } = splitFields(def, args.fields || {});
        const who = await def.verify(config, secret);
        return { ok: true, ...who };
      }

      case "connect": {
        const def = CONNECTORS[args.id];
        if (!def || !def.verify) throw new Error("connections: " + args.id + " cannot be connected here");
        const { secret, config } = splitFields(def, args.fields || {});
        /* Verified BEFORE anything is stored, so a failed connect leaves no
           half-configured row and no orphaned credential behind. */
        const who = await def.verify(config, secret);

        const secretRef = refFor(args.id);
        if (secret) await ctx.credentials.set(secretRef, secret);
        const conn = Connection.parse({
          id: args.id, config, secretRef: secret ? secretRef : "",
          account: who.account || "", displayName: who.name || who.account || "",
          verifiedAt: Date.now(), lastError: null,
        });
        await putConn(conn);
        os.observe({
          appId: "conn", verb: "create", target: args.id,
          summary: "connected " + def.name + " as " + (who.account || "an account"),
          actor: "human",
        });
        return { ok: true, account: who.account, name: who.name };
      }

      case "disconnect": {
        const conn = getConn(args.id);
        if (!conn) throw new Error("connections: " + args.id + " is not connected");
        await dropConn(args.id);
        /* The credential goes with it. Leaving a working token behind for a
           connection the user believes is gone would be indefensible. */
        if (conn.secretRef) { try { await ctx.credentials.unset(conn.secretRef); } catch { /* already absent */ } }
        os.observe({
          appId: "conn", verb: "delete", target: args.id,
          summary: "disconnected " + (CONNECTORS[args.id] ? CONNECTORS[args.id].name : args.id),
          actor: "human",
        });
        return { ok: true };
      }

      case "state": {
        const p = await providers();
        const mail = await mailbox();
        /* The mail card is built from the app's live state, so the generic
           manifest scan must not add a second, vaguer one for the same app. */
        const rows = [...p.rows, ...mail, ...appEgress(mail.map((m) => m.id))];
        const external = rows.filter((r) => r.residency === "external" && r.state === "connected").length;
        const local = rows.filter((r) => r.residency === "local").length;
        return {
          rows,
          notConnected: NOT_CONNECTED,
          summary: {
            total: rows.length,
            external, local,
            unknown: rows.filter((r) => r.residency === "unknown").length,
            llmAvailable: p.available,
            llmError: p.error || null,
          },
        };
      }
      default:
        throw new Error('connections: unknown command "' + command + '"');
    }
  }

  os.registerApp({
    id: "conn",
    name: "Connections",
    publisher: "Magna",
    version: "0.1.0",
    pkg: "@magna/app-connections",
    icon: "i-plug",
    tile: "g-conn",
    window: { w: 900, h: 620, minW: 520, minH: 380, multi: false },
    placement: { dock: true, desktop: true, order: 60 },
    aliases: ["connections", "connectors", "integrations", "providers"],
    /* It verifies connections by calling the services, so it egresses. Saying
       otherwise would make its own screen understate the machine's surface. */
    permissions: { grant: ["conn:read", "conn:write", "net:egress"], deny: ["fs:write"] },
    contributes: {
      tools: [],
      commands: ["state", "connectors", "testConnector", "connect", "disconnect"],
      /* Reading what is connected changes nothing, so it must not journal.
         `testConnector` reaches the network but stores nothing, so it counts as
         a read here. */
      readOnly: ["state", "connectors", "testConnector"],
    },
    clientRoot: resolve(HERE, "..", "client"),
    clientEntry: "app.js",
  }, invoke);

  console.log("[app-connections] layer 3 registered - real connectors only");
}
