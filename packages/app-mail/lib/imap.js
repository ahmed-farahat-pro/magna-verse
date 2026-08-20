import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

/**
 * The IMAP/SMTP connector.
 *
 * Connections are opened per operation and closed after, rather than held open
 * with IDLE. That is a deliberate trade: IDLE would give push, but it means the
 * harness owns a live socket for as long as the app is installed, and an
 * uninstall or a crash leaks it. Mail that arrives while nothing is looking is
 * found on the next sync, which for a desktop mail client is the right
 * behaviour and is honest about what it is.
 *
 * @module @magna/app-mail/imap
 */

/** ImapFlow logs one line per command at info level; the desktop does not need it. */
const QUIET = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

function client(account, secret) {
  return new ImapFlow({
    host: account.host,
    port: account.port || 993,
    secure: account.secure !== false,
    auth: { user: account.user, pass: secret },
    logger: QUIET,
    /* A hung TLS handshake against a wrong host would otherwise sit until the
       OS timeout, and the Connect screen would just spin. */
    socketTimeout: 30000,
    greetingTimeout: 15000,
    connectionTimeout: 15000,
  });
}

/**
 * Turn an ImapFlow failure into something a person can act on.
 *
 * `err.message` is "Command failed" for every server-side rejection — including
 * a wrong password, which is the single most likely thing to go wrong on the
 * Connect screen. The detail is on `responseText` and `serverResponseCode`
 * instead, so a Connect screen that only printed `message` would tell the user
 * nothing at the exact moment they need to know what to fix.
 */
export function describeError(e) {
  const said = e.responseText ? String(e.responseText) : "";
  if (e.authenticationFailed || e.serverResponseCode === "AUTHENTICATIONFAILED") {
    return "The server rejected those credentials" + (said ? " — " + said : "") +
           ". Many providers require an app password rather than your account password.";
  }
  if (e.serverResponseCode === "ALERT" && said) return said;
  if (e.code === "ENOTFOUND") return "No server found at that address. Check the hostname.";
  if (e.code === "ECONNREFUSED") return "The server refused the connection. Check the port.";
  if (e.code === "ETIMEDOUT" || /timeout/i.test(e.message || "")) {
    return "The server did not answer in time. Check the hostname, the port, and whether TLS is right.";
  }
  if (/certificate|self.signed|altname/i.test(e.message || "")) {
    return "The server's TLS certificate was not accepted: " + e.message;
  }
  return said || e.message || "The mail server refused the request.";
}

/** Wrap a connector call so every failure carries a usable message. */
async function friendly(fn) {
  try {
    return await fn();
  } catch (e) {
    const wrapped = new Error(describeError(e));
    wrapped.cause = e;
    throw wrapped;
  }
}

/** Strip the angle brackets from an RFC 5322 Message-ID. */
const normId = (raw) => String(raw || "").trim().replace(/^</, "").replace(/>$/, "");

/** ENVELOPE addresses -> our flat shape. */
const addrs = (list) => (list || []).map((a) => ({
  name: String(a.name || ""),
  address: String(a.address || "").toLowerCase(),
}));

/**
 * Verify credentials without importing anything.
 *
 * The Connect screen calls this before saving, so a typo in the host or the
 * password is reported at the moment it can be fixed rather than becoming an
 * account row that silently never syncs.
 */
export async function verify(account, secret) {
  return friendly(async () => {
  const c = client(account, secret);
  try {
    await c.connect();
    const list = await c.list();
    return {
      ok: true,
      folders: list.map((f) => f.path),
      /* Which folder the server calls its inbox is not always "INBOX". */
      inbox: (list.find((f) => f.specialUse === "\\Inbox") || { path: "INBOX" }).path,
    };
  } finally {
    /* logout() can itself throw on a half-open socket; the caller's result must
       not depend on a clean goodbye. */
    try { await c.logout(); } catch { /* already gone */ }
  }
  });
}

export async function listFolders(account, secret) {
  return friendly(async () => {
  const c = client(account, secret);
  try {
    await c.connect();
    const list = await c.list();
    return list.map((f) => ({
      path: f.path,
      name: f.name,
      specialUse: f.specialUse || null,
      subscribed: !!f.subscribed,
    }));
  } finally {
    try { await c.logout(); } catch { /* already gone */ }
  }
  });
}

/**
 * Fetch the most recent messages in a folder.
 *
 * Envelope and structure only for the list — bodies are fetched on read. A
 * mailbox with 20k messages must not become 20k body downloads because someone
 * opened the app.
 */
export async function fetchRecent(account, secret, folder, limit) {
  return friendly(async () => {
  const c = client(account, secret);
  const out = [];
  try {
    await c.connect();
    const lock = await c.getMailboxLock(folder || "INBOX");
    try {
      const total = c.mailbox.exists;
      if (!total) return out;
      const n = Math.max(1, Math.min(200, limit || 50));
      const from = Math.max(1, total - n + 1);
      for await (const msg of c.fetch(from + ":*", {
        envelope: true, flags: true, bodyStructure: true, uid: true,
      })) {
        const env = msg.envelope || {};
        const id = normId(env.messageId) || (account.id + ":" + folder + ":" + msg.uid);
        out.push({
          id,
          accountId: account.id,
          folder: folder || "INBOX",
          uid: msg.uid,
          /* The root of the References chain is the thread. Falling back to the
             message's own id means a message with no references is a thread of
             one, which is correct rather than a special case. */
          threadId: normId((env.inReplyTo || "").split(/\s+/)[0]) || id,
          subject: String(env.subject || ""),
          from: addrs(env.from)[0] || { name: "", address: "" },
          to: addrs(env.to),
          cc: addrs(env.cc),
          date: env.date ? new Date(env.date).getTime() : Date.now(),
          seen: !!(msg.flags && msg.flags.has("\\Seen")),
          flagged: !!(msg.flags && msg.flags.has("\\Flagged")),
          hasAttachments: hasAttachments(msg.bodyStructure),
          preview: "",
          body: "",
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    try { await c.logout(); } catch { /* already gone */ }
  }
  return out.sort((a, b) => b.date - a.date);
  });
}

/** One message's text body, parsed. */
export async function fetchBody(account, secret, folder, uid) {
  return friendly(async () => {
  const c = client(account, secret);
  try {
    await c.connect();
    const lock = await c.getMailboxLock(folder || "INBOX");
    try {
      const msg = await c.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg || !msg.source) return { text: "", html: false };
      const parsed = await simpleParser(msg.source);
      /* `text` is the text/plain part; mailparser derives it from the HTML when
         there is no plain alternative. Storing markup would mean rendering a
         stranger's HTML inside the desktop, so only text crosses this line. */
      return {
        text: String(parsed.text || "").trim(),
        html: !!parsed.html,
        attachments: (parsed.attachments || []).map((a) => ({
          filename: a.filename || "(unnamed)",
          size: a.size || 0,
          contentType: a.contentType || "",
        })),
      };
    } finally {
      lock.release();
    }
  } finally {
    try { await c.logout(); } catch { /* already gone */ }
  }
  });
}

/**
 * Search on the SERVER, not in the cache.
 *
 * The cache holds the most recent few hundred messages; a question about
 * something from March is not answerable from it. IMAP SEARCH runs against the
 * whole mailbox, which is what makes `mail_search` worth giving to the agent.
 */
export async function search(account, secret, folder, query, limit) {
  return friendly(async () => {
  const c = client(account, secret);
  const out = [];
  try {
    await c.connect();
    const lock = await c.getMailboxLock(folder || "INBOX");
    try {
      const q = String(query || "").trim();
      if (!q) return out;
      /* OR across subject/from/body, which is what a person means by "search". */
      const uids = await c.search({ or: [{ subject: q }, { from: q }, { body: q }] }, { uid: true });
      if (!uids || !uids.length) return out;
      const take = uids.slice(-Math.max(1, Math.min(100, limit || 25)));
      for await (const msg of c.fetch(take, { envelope: true, flags: true, uid: true }, { uid: true })) {
        const env = msg.envelope || {};
        const id = normId(env.messageId) || (account.id + ":" + folder + ":" + msg.uid);
        out.push({
          id, accountId: account.id, folder: folder || "INBOX", uid: msg.uid,
          threadId: normId((env.inReplyTo || "").split(/\s+/)[0]) || id,
          subject: String(env.subject || ""),
          from: addrs(env.from)[0] || { name: "", address: "" },
          to: addrs(env.to), cc: addrs(env.cc),
          date: env.date ? new Date(env.date).getTime() : Date.now(),
          seen: !!(msg.flags && msg.flags.has("\\Seen")),
          flagged: !!(msg.flags && msg.flags.has("\\Flagged")),
          hasAttachments: false, preview: "", body: "",
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    try { await c.logout(); } catch { /* already gone */ }
  }
  return out.sort((a, b) => b.date - a.date);
  });
}

/** Walk the BODYSTRUCTURE for a disposition of `attachment`. */
function hasAttachments(node) {
  if (!node) return false;
  if (node.disposition === "attachment") return true;
  return (node.childNodes || []).some(hasAttachments);
}
