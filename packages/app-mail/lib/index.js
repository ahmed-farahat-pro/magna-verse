import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { openStore, entitiesOf } from "./store.js";
import * as imap from "./imap.js";
import * as graph from "./graph.js";
import * as smtp from "./smtp.js";

/**
 * Mail — a layer-3 app plugin.
 *
 * The Console's Mail app was 49 lines over five hardcoded records with no body,
 * no recipients, no thread and no protocol anywhere. This replaces it with a
 * real client, and the most important thing about it is what it does when it is
 * NOT configured: it shows a Connect screen. Not a sample inbox, not a
 * "demo mode" — nothing, until there is a real mailbox behind it.
 *
 * Two connectors, one entity model. IMAP/SMTP talks to any server; Microsoft
 * Graph talks to Microsoft 365. They resolve to the same entity ids because
 * both expose the RFC 5322 Message-ID, so a message seen through both is one
 * node in the brain rather than two.
 *
 * @module @magna/app-mail
 */

export const name = "magna-app-mail";

/**
 * `credentials` is why this app can exist without writing a password to disk in
 * the clear: what is stored in the account row is the NAME of a credential, and
 * the value lives in the harness's own credential store. It is mounted by
 * `dsh-base` in every profile, so injecting it is safe.
 */
export const inject = ["magnaOS", "tools", "storageDomain", "credentials"];

const HERE = dirname(fileURLToPath(import.meta.url));

let seq = 0;
const nextId = (p) => p + Date.now().toString(36) + "-" + (++seq).toString(36);

export async function apply(ctx) {
  const os = ctx.magnaOS;
  const store = await openStore(ctx);

  ctx.effect(() => () => { store.close().catch(() => {}); }, "app-mail: close storage domain");

  /** Resolve an account's secret at the moment it is needed, never cached. */
  async function secretFor(account) {
    if (!account.secretRef) throw new Error("mail: this account has no stored credential");
    const r = await ctx.credentials.resolve(account.secretRef);
    if (!r || !r.value) {
      throw new Error(
        "mail: the credential for this account is missing. Reconnect the account to store it again.",
      );
    }
    return r.value;
  }

  /* ---- Microsoft 365 tokens ---------------------------------------------
     Access tokens last an hour, so every Graph call goes through here rather
     than trusting whatever was stored at connect time. The refresh token is a
     credential like any other and lives in the credential store; only its
     REFERENCE is in the account row. */
  const pendingSignIn = new Map();

  async function graphToken(account) {
    const raw = await secretFor(account);
    let tok;
    try { tok = JSON.parse(raw); } catch { throw new Error("mail: the stored Microsoft token is unreadable — reconnect the account"); }
    if (tok.accessToken && tok.expiresAt > Date.now()) return tok.accessToken;
    if (!tok.refreshToken) throw new Error("mail: this Microsoft connection has expired — reconnect the account");
    const next = await graph.refresh(account.tenant, account.clientId, tok.refreshToken, true);
    /* Microsoft does not always return a new refresh token; dropping the old
       one when it does not is how a connection dies on the second refresh. */
    const merged = { ...next, refreshToken: next.refreshToken || tok.refreshToken };
    await ctx.credentials.set(account.secretRef, JSON.stringify(merged));
    return merged.accessToken;
  }

  /** The one configured account, or null. */
  function current() {
    const all = store.accounts();
    return all.length ? all[0] : null;
  }

  function requireAccount() {
    const a = current();
    if (!a) throw new Error("mail: no mailbox is connected yet");
    return a;
  }

  /** Record a failure on the account so the UI can say what went wrong. */
  async function noteError(account, e) {
    account.lastError = e.message;
    await store.putAccount(account);
    return e;
  }

  /* ---- sync -------------------------------------------------------------
     Pulls recent envelopes into the cache. Called on open and on demand, never
     on a timer: a background poll on someone's mailbox is a surprising amount
     of network traffic to start without being asked. */
  async function sync(account, folder, limit) {
    let list;
    try {
      list = account.kind === "graph"
        ? await graph.fetchRecent(await graphToken(account), account.id, folder, limit || 50)
        : await imap.fetchRecent(account, await secretFor(account), folder || "INBOX", limit || 50);
    } catch (e) {
      throw await noteError(account, e);
    }
    await store.putMessages(list);
    account.lastSync = Date.now();
    account.lastError = null;
    await store.putAccount(account);
    /* One journal entry for the sync, not one per message — the brain wants to
       know the mailbox was read, not to be handed 50 rows of noise. */
    os.observe({
      appId: "mail", verb: "read", target: folder || "INBOX",
      summary: "synced " + list.length + " message(s) from " + (account.address || account.user),
      actor: "system",
      entities: list.slice(0, 12).flatMap((m) => entitiesOf(m)).slice(0, 12),
    });
    return list.length;
  }

  async function invoke(command, args) {
    switch (command) {
      /* The Connect screen's first question: is anything set up at all? */
      case "state": {
        const a = current();
        return {
          connected: !!a,
          durable: store.durable,
          account: a ? {
            id: a.id, kind: a.kind, label: a.label, address: a.address,
            host: a.host, user: a.user,
            lastSync: a.lastSync, lastError: a.lastError,
          } : null,
        };
      }

      /**
       * Test a set of credentials WITHOUT saving them.
       *
       * Separate from `connect` on purpose: a typo should be reported while the
       * form is still open, not turned into a saved account that silently never
       * syncs. The password is used and discarded here — it is only stored when
       * `connect` succeeds.
       */
      /**
       * Step one of Microsoft 365 sign-in: ask Azure for a device code.
       *
       * Device-code rather than authorization-code on purpose — no redirect
       * URI, no local callback server, no embedded browser, and the password is
       * never typed into anything this project wrote. The user is shown a code,
       * signs in wherever they like, and `m365Poll` waits.
       */
      case "m365Start": {
        const tenant = String(args.tenant || "common").trim();
        const clientId = String(args.clientId || "").trim();
        const d = await graph.startDeviceCode(tenant, clientId, true);
        const key = nextId("signin");
        pendingSignIn.set(key, { ...d, tenant, clientId, at: Date.now() });
        /* Sign-in codes expire; so does this entry, or an abandoned attempt
           leaks a device code for the life of the process. */
        setTimeout(() => pendingSignIn.delete(key), (d.expiresIn || 900) * 1000);
        return {
          key, userCode: d.userCode, verificationUri: d.verificationUri,
          expiresIn: d.expiresIn, message: d.message,
        };
      }

      /* Step two: block until the user finishes, then store the tokens. */
      case "m365Poll": {
        const pend = pendingSignIn.get(args.key);
        if (!pend) throw new Error("mail: that sign-in attempt has expired — start again");
        const tok = await graph.pollForToken(pend.tenant, pend.clientId, pend.deviceCode, {
          expiresIn: pend.expiresIn, interval: pend.interval,
        });
        pendingSignIn.delete(args.key);
        const who = await graph.me(tok.accessToken);

        const id = nextId("acct");
        const secretRef = "MAGNA_MAIL_" + id.toUpperCase().replace(/[^A-Z0-9]/g, "_");
        /* The whole token bundle is a secret, so it goes to the credential
           store as one value. Nothing token-shaped is written to settings. */
        await ctx.credentials.set(secretRef, JSON.stringify(tok));

        const account = {
          id, kind: "graph",
          label: "Microsoft 365", address: who.address,
          host: "", port: 993, secure: true, user: who.address,
          smtpHost: "", smtpPort: 587, smtpSecure: false,
          tenant: pend.tenant, clientId: pend.clientId,
          secretRef,
          createdAt: Date.now(), lastSync: null, lastError: null,
        };
        await store.putAccount(account);
        os.observe({
          appId: "mail", verb: "create", target: account.id,
          summary: "connected the mailbox " + who.address + " over Microsoft 365",
          actor: "human", entities: ["person:" + String(who.address).toLowerCase()],
        });
        const n = await sync(account, "inbox", 50);
        return { ok: true, address: who.address, name: who.name, synced: n };
      }

      case "test": {
        if (args.kind === "graph") {
          throw new Error("Use Sign in with Microsoft — there is no password to test.");
        }
        const probe = {
          host: String(args.host || "").trim(),
          port: Number(args.port) || 993,
          secure: args.secure !== false,
          user: String(args.user || "").trim(),
        };
        if (!probe.host || !probe.user) throw new Error("mail: host and username are both required");
        if (!args.password) throw new Error("mail: no password given");
        const r = await imap.verify(probe, String(args.password));
        return { ok: true, folders: r.folders.slice(0, 50), inbox: r.inbox };
      }

      case "connect": {
        if (args.kind === "graph") {
          throw new Error("Microsoft 365 is not connected yet — use IMAP for now.");
        }
        const host = String(args.host || "").trim();
        const user = String(args.user || "").trim();
        if (!host || !user) throw new Error("mail: host and username are both required");
        if (!args.password) throw new Error("mail: no password given");

        const probe = { host, port: Number(args.port) || 993, secure: args.secure !== false, user };
        /* Verified before anything is written, so a failed connect leaves no
           half-configured account behind. */
        const r = await imap.verify(probe, String(args.password));

        const id = nextId("acct");
        const secretRef = "MAGNA_MAIL_" + id.toUpperCase().replace(/[^A-Z0-9]/g, "_");
        /* The value goes to the credential store; the account row keeps only
           the reference. Nothing here writes a password into settings. */
        await ctx.credentials.set(secretRef, String(args.password));

        const account = {
          id, kind: "imap",
          label: String(args.label || host),
          address: String(args.address || user),
          host, port: probe.port, secure: probe.secure, user,
          smtpHost: String(args.smtpHost || ""),
          smtpPort: Number(args.smtpPort) || 587,
          smtpSecure: !!args.smtpSecure,
          tenant: "", clientId: "",
          secretRef,
          createdAt: Date.now(), lastSync: null, lastError: null,
        };
        await store.putAccount(account);
        os.observe({
          appId: "mail", verb: "create", target: account.id,
          summary: "connected the mailbox " + account.address + " over IMAP",
          actor: "human", entities: ["person:" + String(account.address).toLowerCase()],
        });
        const n = await sync(account, r.inbox, 50);
        return { ok: true, account: { id, address: account.address, host }, synced: n, inbox: r.inbox };
      }

      case "disconnect": {
        const a = requireAccount();
        await store.deleteAccount(a.id);
        /* The credential goes too. Leaving it behind would mean "disconnect"
           left a working password on disk for a mailbox the user believes is
           gone. */
        if (a.secretRef) { try { await ctx.credentials.unset(a.secretRef); } catch { /* already absent */ } }
        os.observe({
          appId: "mail", verb: "delete", target: a.id,
          summary: "disconnected the mailbox " + a.address, actor: "human",
        });
        return { ok: true };
      }

      case "sync": {
        const a = requireAccount();
        return { synced: await sync(a, args && args.folder, args && args.limit) };
      }

      case "folders": {
        const a = requireAccount();
        return {
          folders: a.kind === "graph"
            ? await graph.listFolders(await graphToken(a))
            : await imap.listFolders(a, await secretFor(a)),
        };
      }

      case "list": {
        const a = current();
        if (!a) return { messages: [], connected: false };
        return {
          connected: true,
          messages: store.messages(a.id, (args && args.folder) || null)
            .slice(0, (args && args.limit) || 100)
            .map(strip),
        };
      }

      case "read": {
        const a = requireAccount();
        const m = store.message(args.id);
        if (!m) throw new Error('mail: no message "' + args.id + '" in the cache — sync first');
        if (!m.body && (m.uid != null || a.kind === "graph")) {
          const parsed = a.kind === "graph"
            ? await graph.fetchBody(await graphToken(a), m.graphId || m.id)
            : await imap.fetchBody(a, await secretFor(a), m.folder, m.uid);
          m.body = parsed.text;
          m.preview = parsed.text.slice(0, 200).replace(/\s+/g, " ");
          await store.putMessages([m]);
        }
        os.observe({
          appId: "mail", verb: "read", target: m.id,
          summary: 'read "' + (m.subject || "(no subject)") + '"',
          entities: entitiesOf(m),
        });
        return m;
      }

      case "search": {
        const a = requireAccount();
        /* Server-side, not over the cache: the cache holds the most recent few
           hundred messages, and a question about March is not answerable from
           it. */
        const hits = a.kind === "graph"
          ? await graph.search(await graphToken(a), a.id, args.q, (args && args.limit) || 25)
          : await imap.search(a, await secretFor(a), (args && args.folder) || "INBOX",
                              args.q, (args && args.limit) || 25);
        await store.putMessages(hits);
        return { hits: hits.map(strip) };
      }

      /**
       * Resolve a draft without sending it.
       *
       * The approval sheet needs the parsed recipient list, not the raw string
       * the user typed: "ahmed@" and "ahmed@magna.sa" look similar in a text
       * box and are not the same decision. A bad address fails HERE, while the
       * composer is still open.
       */
      case "sendPreview": {
        const a = requireAccount();
        const to = smtp.parseAddressList(args.to);
        const cc = args.cc ? smtp.parseAddressList(args.cc) : [];
        return {
          from: a.address || a.user,
          via: a.kind === "graph" ? "Microsoft 365" : (a.smtpHost || a.host.replace(/^imap\./, "smtp.")),
          to: to.map((x) => x.address), cc: cc.map((x) => x.address),
          subject: String(args.subject || ""),
          bytes: Buffer.byteLength(String(args.body || "")),
        };
      }

      /**
       * Send.
       *
       * The first action in this whole system that reaches another human. A
       * file written can be undone; a message delivered cannot. So this is
       * gated in the UI before it is ever called, and the tool wrapper below
       * refuses to let the agent call it at all.
       */
      case "send": {
        const a = requireAccount();
        const to = smtp.parseAddressList(args.to);
        const cc = args.cc ? smtp.parseAddressList(args.cc) : [];
        const r = a.kind === "graph"
          ? await graph.send(await graphToken(a), args, to, cc)
          : await smtp.send(a, await secretFor(a), args);
        os.observe({
          appId: "mail", verb: "write", target: r.messageId || to[0].address,
          summary: 'sent "' + String(args.subject || "(no subject)").slice(0, 60) + '" to ' +
                   to.map((x) => x.address).join(", "),
          actor: "human",
          entities: (r.messageId ? ["mail:" + r.messageId] : [])
            .concat(to.map((x) => "person:" + x.address)),
        });
        return { ok: true, ...r };
      }

      /** Check the SMTP side without sending — different server, different rules. */
      case "testSend": {
        const a = requireAccount();
        if (a.kind === "graph") return { ok: true, via: "Microsoft Graph", note: "Sending uses the same sign-in." };
        return smtp.verifySend(a, await secretFor(a));
      }

      default:
        throw new Error('mail: unknown command "' + command + '"');
    }
  }

  /** List rows never carry the body — it is fetched on read. */
  function strip(m) {
    return {
      id: m.id, folder: m.folder, subject: m.subject, from: m.from, to: m.to,
      date: m.date, seen: m.seen, flagged: m.flagged,
      hasAttachments: m.hasAttachments, preview: m.preview,
    };
  }

  const dispose = os.registerApp({
    id: "mail",
    name: "Mail",
    publisher: "Magna",
    version: "0.1.0",
    pkg: "@magna/app-mail",
    icon: "i-mail",
    tile: "g-mail",
    window: { w: 980, h: 640, minW: 560, minH: 380, multi: false },
    placement: { dock: true, desktop: true, order: 25 },
    aliases: ["mail", "email", "inbox", "outlook", "imap"],
    /* `net:egress` is declared and true: mail leaves this machine by
       definition. Saying otherwise would make the Sovereignty widget lie. */
    permissions: { grant: ["mail:read", "mail:send", "net:egress"], deny: ["fs:write"] },
    contributes: {
      tools: ["mail_search", "mail_read", "mail_list"],
      commands: ["state", "test", "connect", "disconnect", "sync", "folders", "list", "read", "search",
                 "m365Start", "m365Poll", "sendPreview", "send", "testSend"],
      /* Polling `state` and `list` must not fill the activity journal. */
      readOnly: ["state", "list", "folders", "sendPreview"],
    },
    clientRoot: resolve(HERE, "..", "client"),
    clientEntry: "app.js",
  }, invoke);

  const scope = dispose.scope;

  /* ---- tools ------------------------------------------------------------ */

  ctx.effect(() => ctx.tools.register(defineTool({
    name: "mail_search",
    description:
      "Search the user's connected mailbox by keyword, across subject, sender and body. Searches " +
      "the whole mailbox on the mail server, not just recent messages. Returns matching messages " +
      "with their ids — use mail_read to get the full text of one.",
    parameters: {
      q: { type: "string", required: true, description: "Words to look for." },
      folder: { type: "string", description: "Folder to search. Defaults to the inbox." },
    },
    output: {
      schema: {
        type: "object", additionalProperties: false,
        properties: {
          hits: {
            type: "array",
            items: { type: "object", additionalProperties: true,
                     properties: { id: { type: "string" }, subject: { type: "string" } } },
          },
        },
      },
      render: (a, v) => [{
        type: "text",
        text: v.hits.length
          ? v.hits.map((h) => h.subject + " — from " + (h.from && h.from.address) +
                              " (" + new Date(h.date).toISOString().slice(0, 10) + ") [" + h.id + "]").join("\n")
          : 'No message matches "' + a.q + '".',
      }],
    },
    async execute(args, exec) {
      const r = await invoke("search", args);
      scope.observe({
        actor: "agent", verb: "read", target: args.q,
        summary: 'searched the mailbox for "' + args.q + '" (' + r.hits.length + " hits)",
        sessionId: exec && exec.agent ? exec.agent.session.id : null,
      });
      return r;
    },
    presentCall: (a) => ({ card: "generic", title: 'Search mail for "' + a.q + '"', kind: "other", rawInput: a }),
  })), "app-mail: tool mail_search");

  ctx.effect(() => ctx.tools.register(defineTool({
    name: "mail_read",
    description:
      "Read one message from the user's mailbox by id, including its full text body. " +
      "Get ids from mail_search or mail_list.",
    parameters: { id: { type: "string", required: true, description: "The message id." } },
    output: {
      schema: { type: "object", additionalProperties: true,
                properties: { id: { type: "string" }, subject: { type: "string" }, body: { type: "string" } } },
      render: (_a, v) => [{
        type: "text",
        text: "From: " + (v.from && v.from.address) + "\nSubject: " + v.subject +
              "\nDate: " + new Date(v.date).toISOString() + "\n\n" + (v.body || "(no text body)"),
      }],
    },
    async execute(args, exec) {
      const m = await invoke("read", args);
      scope.observe({
        actor: "agent", verb: "read", target: m.id,
        summary: 'read "' + (m.subject || "(no subject)") + '"',
        entities: entitiesOf(m),
        sessionId: exec && exec.agent ? exec.agent.session.id : null,
      });
      return m;
    },
    presentCall: (a) => ({ card: "generic", title: "Read message " + a.id, kind: "other", rawInput: a }),
  })), "app-mail: tool mail_read");

  ctx.effect(() => ctx.tools.register(defineTool({
    name: "mail_list",
    description:
      "List the most recent messages in the user's mailbox. Use mail_search instead when looking " +
      "for something specific — this returns what is newest, not what is relevant.",
    parameters: {
      folder: { type: "string", description: "Folder. Defaults to the inbox." },
      limit: { type: "number", description: "How many to return. Default 25." },
    },
    output: {
      schema: {
        type: "object", additionalProperties: false,
        properties: { messages: { type: "array", items: { type: "object", additionalProperties: true,
          properties: { id: { type: "string" }, subject: { type: "string" } } } } },
      },
      render: (_a, v) => [{
        type: "text",
        text: v.messages.length
          ? v.messages.map((m) => (m.seen ? "  " : "• ") + m.subject + " — " +
                                  (m.from && m.from.address) + " [" + m.id + "]").join("\n")
          : "The mailbox is empty, or nothing is connected yet.",
      }],
    },
    async execute(args, exec) {
      const r = await invoke("list", { folder: args.folder, limit: args.limit || 25 });
      scope.observe({
        actor: "agent", verb: "read", target: args.folder || "INBOX",
        summary: "listed " + r.messages.length + " message(s)",
        sessionId: exec && exec.agent ? exec.agent.session.id : null,
      });
      return { messages: r.messages };
    },
    presentCall: () => ({ card: "generic", title: "List recent mail", kind: "other" }),
  })), "app-mail: tool mail_list");

  /* ---- deliberately NOT registered: a send tool -------------------------
     There is no `mail_send` for the agent, and that is a decision rather than
     an omission. Every other gate in this system is recoverable: an approved
     shell command can be undone, a written file can be deleted, a workflow can
     be cancelled mid-run. A delivered message cannot be recalled, and the
     person who receives it has no idea a model wrote it.

     The harness's own tool-approval path would put a prompt in front of it, but
     that prompt lives in the agent transcript — the wrong place for a decision
     about who receives mail in the user's name. Sending stays in the composer,
     behind the OS approval sheet, which shows the RESOLVED recipient list.

     `mail_search` and `mail_read` give the agent everything it needs to answer
     questions about the mailbox. Drafting for human review is the right next
     step here, not sending. */

  console.log("[app-mail] layer 3 registered - 14 commands, 3 tools" +
              (current() ? " (mailbox connected)" : " (no mailbox connected)"));
}
