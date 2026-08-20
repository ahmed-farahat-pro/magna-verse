/**
 * Connector definitions.
 *
 * Each entry describes a real integration: how it authenticates, which endpoint
 * proves the credentials work, and what to show once they do. There is no entry
 * for a system nothing can reach — the screen this replaces listed ten, six of
 * them showing a green "linked" tick, and admitted at the bottom that no OAuth
 * handshake ever happened and no token was ever stored.
 *
 * Three honest tiers, and the UI shows which tier each one is in:
 *
 *   `verified`   — built and tested against the live service.
 *   `untested`   — the protocol is standard and the code is real, but it needs
 *                  a server on your network to try, so nobody here has run it.
 *   `elsewhere`  — connecting happens in another app, and this row links there
 *                  rather than duplicating the flow.
 *
 * A connector is never marked connected because a form was filled in. It is
 * marked connected because `verify` called the service and the service
 * answered.
 *
 * @module @magna/app-connections/connectors
 */

/** Shared fetch with a timeout, so a wrong host cannot hang the UI. */
async function call(url, opts, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs || 20000);
  try {
    return await fetch(url, { ...opts, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Read a total count out of a paginated `Link: …rel="last"` header. */
function countFromLink(link) {
  if (!link) return null;
  const m = /[?&]page=(\d+)>;\s*rel="last"/.exec(link);
  return m ? Number(m[1]) : null;
}

const basic = (u, p) => "Basic " + Buffer.from(u + ":" + p).toString("base64");

/** Normalise a host the user typed into an https origin. */
function origin(raw, fallback) {
  const s = String(raw || fallback || "").trim().replace(/\/+$/, "");
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : "https://" + s;
}

export const CONNECTORS = {

  /* ---------------------------------------------------------------- GitHub */
  github: {
    name: "GitHub", ab: "GH", brand: "#24292F", tier: "verified",
    blurb: "Repositories, issues and pull requests",
    egress: "api.github.com",
    /* A fine-grained or classic PAT rather than an OAuth app: a PAT needs no
       app registration, no callback URL and no client secret, and the user can
       scope and revoke it themselves on a page they already trust. */
    fields: [
      { k: "token", l: "Personal access token", secret: true,
        hint: "github.com → Settings → Developer settings → Tokens. Read-only scopes are enough." },
    ],
    async verify(cfg, secret) {
      const res = await call("https://api.github.com/user", {
        headers: { authorization: "Bearer " + secret, accept: "application/vnd.github+json" },
      });
      if (res.status === 401) throw new Error("GitHub rejected that token.");
      if (res.status === 403) throw new Error("GitHub refused: the token is valid but lacks the needed scope, or you are rate-limited.");
      if (!res.ok) throw new Error("GitHub returned HTTP " + res.status + ".");
      const me = await res.json();
      return { account: me.login, name: me.name || me.login };
    },
    async probe(cfg, secret) {
      const res = await call("https://api.github.com/user/repos?per_page=1&affiliation=owner,collaborator,organization_member", {
        headers: { authorization: "Bearer " + secret, accept: "application/vnd.github+json" },
      });
      if (!res.ok) return {};
      const n = countFromLink(res.headers.get("link"));
      const scopes = res.headers.get("x-oauth-scopes");
      return {
        detail: (n != null ? n + " repositories" : "connected") + (scopes ? " · scopes: " + scopes : ""),
      };
    },
  },

  /* ---------------------------------------------------------------- GitLab */
  gitlab: {
    name: "GitLab", ab: "GL", brand: "#E24329", tier: "verified",
    blurb: "Projects, issues and merge requests · works with self-managed",
    egress: "gitlab.com or your instance",
    fields: [
      { k: "host", l: "Instance URL", d: "https://gitlab.com",
        hint: "Your own server if it is self-managed — nothing leaves your network in that case." },
      { k: "token", l: "Personal access token", secret: true,
        hint: "Profile → Access tokens. `read_api` is enough to browse." },
    ],
    async verify(cfg, secret) {
      const base = origin(cfg.host, "https://gitlab.com");
      const res = await call(base + "/api/v4/user", { headers: { "PRIVATE-TOKEN": secret } });
      if (res.status === 401) throw new Error("GitLab rejected that token.");
      if (!res.ok) throw new Error("GitLab returned HTTP " + res.status + " from " + base + ".");
      const me = await res.json();
      return { account: me.username, name: me.name || me.username };
    },
    async probe(cfg, secret) {
      const base = origin(cfg.host, "https://gitlab.com");
      const res = await call(base + "/api/v4/projects?membership=true&per_page=1", { headers: { "PRIVATE-TOKEN": secret } });
      if (!res.ok) return {};
      const n = res.headers.get("x-total");
      return { detail: (n ? n + " projects" : "connected") + " · " + base.replace(/^https?:\/\//, "") };
    },
  },

  /* ------------------------------------------------- Jira & Confluence ---- */
  atlassian: {
    name: "Jira & Confluence", ab: "AT", brand: "#0052CC", tier: "verified",
    blurb: "Issues, boards, pages and spaces",
    egress: "your-site.atlassian.net",
    /* One connector for both: they share a site, an account and an API token,
       and splitting them would mean asking for the same credential twice. */
    fields: [
      { k: "site", l: "Site URL", d: "", hint: "e.g. magna.atlassian.net" },
      { k: "email", l: "Account email", d: "" },
      { k: "token", l: "API token", secret: true,
        hint: "id.atlassian.com → Security → API tokens." },
    ],
    async verify(cfg, secret) {
      const base = origin(cfg.site);
      if (!base) throw new Error("Give the Atlassian site URL first.");
      if (!cfg.email) throw new Error("Atlassian needs the account email as well as the token.");
      const res = await call(base + "/rest/api/3/myself", {
        headers: { authorization: basic(cfg.email, secret), accept: "application/json" },
      });
      if (res.status === 401) throw new Error("Atlassian rejected that email and token pair.");
      if (res.status === 404) throw new Error("No Jira found at " + base + " — check the site URL.");
      if (!res.ok) throw new Error("Atlassian returned HTTP " + res.status + ".");
      const me = await res.json();
      return { account: me.emailAddress || cfg.email, name: me.displayName || cfg.email };
    },
    async probe(cfg, secret) {
      const base = origin(cfg.site);
      const auth = { authorization: basic(cfg.email, secret), accept: "application/json" };
      let projects = null, spaces = null;
      try {
        const p = await call(base + "/rest/api/3/project/search?maxResults=1", { headers: auth });
        if (p.ok) projects = (await p.json()).total;
      } catch { /* Jira may be absent on a Confluence-only site */ }
      try {
        const s = await call(base + "/wiki/api/v2/spaces?limit=1", { headers: auth });
        if (s.ok) spaces = ((await s.json()).results || []).length ? "yes" : null;
      } catch { /* Confluence may be absent */ }
      const bits = [];
      if (projects != null) bits.push(projects + " Jira projects");
      if (spaces) bits.push("Confluence present");
      return { detail: bits.join(" · ") || "connected" };
    },
  },

  /* ------------------------------------------------------------ ServiceNow */
  servicenow: {
    name: "ServiceNow", ab: "SN", brand: "#62D84E", tier: "untested",
    blurb: "Incidents, changes and CMDB records",
    egress: "your-instance.service-now.com",
    fields: [
      { k: "instance", l: "Instance", d: "", hint: "e.g. magna.service-now.com" },
      { k: "user", l: "Username", d: "" },
      { k: "password", l: "Password", secret: true },
    ],
    async verify(cfg, secret) {
      const base = origin(cfg.instance);
      if (!base) throw new Error("Give the ServiceNow instance first.");
      const res = await call(base + "/api/now/table/sys_user?sysparm_limit=1", {
        headers: { authorization: basic(cfg.user, secret), accept: "application/json" },
      });
      if (res.status === 401) throw new Error("ServiceNow rejected those credentials.");
      if (!res.ok) throw new Error("ServiceNow returned HTTP " + res.status + ".");
      return { account: cfg.user, name: cfg.user };
    },
    async probe(cfg, secret) {
      const base = origin(cfg.instance);
      const res = await call(base + "/api/now/table/incident?sysparm_limit=1&sysparm_query=active=true", {
        headers: { authorization: basic(cfg.user, secret), accept: "application/json" },
      });
      if (!res.ok) return {};
      const n = res.headers.get("x-total-count");
      return { detail: n ? n + " active incidents" : "connected" };
    },
  },

  /* ----------------------------------------------------- generic REST/OData
     SAP S/4HANA and Primavera P6 both expose OData or REST behind a corporate
     gateway. There is no public instance to build against, so rather than
     inventing a vendor-shaped connector that has never spoken to the vendor,
     this is one honest generic: you give the endpoint and the credentials, and
     it calls exactly what you tell it to. */
  odata: {
    name: "SAP, Primavera or any REST endpoint", ab: "EP", brand: "#0FAAFF", tier: "untested",
    blurb: "A generic connector for an OData or REST service on your network",
    egress: "whatever endpoint you give it",
    fields: [
      { k: "label", l: "Name it", d: "", hint: "e.g. SAP S/4HANA, Primavera P6" },
      { k: "base", l: "Base URL", d: "", hint: "e.g. https://sap.internal/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV" },
      { k: "probe", l: "Test path", d: "/", hint: "A cheap GET that proves the credentials work." },
      { k: "user", l: "Username", d: "" },
      { k: "password", l: "Password or token", secret: true },
    ],
    async verify(cfg, secret) {
      const base = origin(cfg.base);
      if (!base) throw new Error("Give the base URL first.");
      const res = await call(base + (cfg.probe || "/"), {
        headers: {
          ...(cfg.user ? { authorization: basic(cfg.user, secret) } : { authorization: "Bearer " + secret }),
          accept: "application/json",
        },
      });
      if (res.status === 401 || res.status === 403) throw new Error("The endpoint rejected those credentials (HTTP " + res.status + ").");
      if (!res.ok) throw new Error("The endpoint returned HTTP " + res.status + ".");
      return { account: cfg.user || "token", name: cfg.label || base };
    },
    async probe(cfg) {
      return { detail: (cfg.label || "endpoint") + " · " + origin(cfg.base).replace(/^https?:\/\//, "") };
    },
  },

  /* --------------------------------------------------------- Microsoft 365
     Not duplicated here. Signing in happens in Mail, where the device-code
     flow and the token refresh already live; a second copy would mean two
     token stores for one account. This row reports that connection and sends
     you to the app that owns it. */
  microsoft: {
    name: "Microsoft 365", ab: "MS", brand: "#0078D4", tier: "elsewhere",
    blurb: "Outlook mail today. SharePoint and Teams need extra Graph scopes.",
    egress: "graph.microsoft.com",
    connectIn: { appId: "mail", label: "Connect in Mail" },
    fields: [],
  },
};

/** Everything the browser needs to draw a card, minus the executable half. */
export function describe(id) {
  const c = CONNECTORS[id];
  if (!c) return null;
  const { verify, probe, ...rest } = c;
  return { id, ...rest };
}

export const IDS = Object.keys(CONNECTORS);
