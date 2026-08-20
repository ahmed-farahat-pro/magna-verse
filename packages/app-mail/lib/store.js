import { z } from "zod";

/**
 * Mail configuration and the message cache.
 *
 * Two things live here, and the split between them is the point. Configuration
 * — which server, which account, which connector — is durable and readable.
 * The password is NOT here: it goes to `ctx.credentials`, and what is stored
 * here is only the reference to it. A settings file that can be read to
 * discover a mailbox password is a settings file that will be.
 *
 * The message cache exists so the window and the agent's `mail_search` can both
 * answer without re-opening an IMAP connection per keystroke. It is a cache and
 * is treated as one: the server is authoritative, and nothing is ever written
 * back from it.
 *
 * @module @magna/app-mail/store
 */

const DOMAIN = "magna_mail";
const VERSION = 1;

/** One configured account. */
const Account = z.object({
  id: z.string(),
  /* `imap` speaks IMAP/SMTP to any server. `graph` speaks Microsoft Graph to
     Microsoft 365. They are separate connectors but resolve to the SAME entity
     ids, so a message seen through both is one thing — see entityOf(). */
  kind: z.enum(["imap", "graph"]),
  label: z.string().default(""),
  address: z.string().default(""),

  /* IMAP/SMTP */
  host: z.string().default(""),
  port: z.number().default(993),
  secure: z.boolean().default(true),
  user: z.string().default(""),
  smtpHost: z.string().default(""),
  smtpPort: z.number().default(587),
  smtpSecure: z.boolean().default(false),

  /* Microsoft 365 */
  tenant: z.string().default(""),
  clientId: z.string().default(""),

  /* The name of the credential, never the credential. */
  secretRef: z.string().default(""),

  createdAt: z.number(),
  lastSync: z.number().nullable().default(null),
  lastError: z.string().nullable().default(null),
});

/**
 * One message, flattened.
 *
 * `id` is the RFC 5322 Message-ID with the angle brackets stripped. Both
 * connectors expose it — Graph as `internetMessageId`, IMAP through ENVELOPE —
 * which is what lets the same message arriving by two routes resolve to one
 * node in the brain rather than two.
 */
const Message = z.object({
  id: z.string(),
  accountId: z.string(),
  folder: z.string().default("INBOX"),
  uid: z.number().nullable().default(null),
  threadId: z.string().default(""),
  subject: z.string().default(""),
  from: z.object({ name: z.string().default(""), address: z.string().default("") }),
  to: z.array(z.object({ name: z.string().default(""), address: z.string().default("") })).default([]),
  cc: z.array(z.object({ name: z.string().default(""), address: z.string().default("") })).default([]),
  date: z.number(),
  seen: z.boolean().default(false),
  flagged: z.boolean().default(false),
  hasAttachments: z.boolean().default(false),
  /* Plain text only. HTML bodies are converted on read; storing markup would
     mean rendering someone else's markup inside the desktop. */
  preview: z.string().default(""),
  body: z.string().default(""),
});

export const SPEC = {
  name: DOMAIN,
  version: VERSION,
  tables: {
    accounts: { valueSchema: Account },
    messages: { valueSchema: Message },
  },
};

/** Bound on the cache. Mail is unbounded; a JSON file rewritten per write is not. */
const MAX_MESSAGES = 500;

export async function openStore(ctx) {
  let domain = null;
  try {
    if (ctx.storageDomain) domain = await ctx.storageDomain.open(SPEC);
  } catch (e) {
    console.error("[app-mail] could not open durable storage (" + e.message + ").");
  }
  if (!domain) {
    console.warn("[app-mail] storageDomain unavailable — the account will not survive a restart.");
    return memoryStore();
  }

  const accounts = domain.table("accounts");
  const messages = domain.table("messages");

  return {
    durable: true,
    close: () => domain.close(),

    accounts: () => [...accounts.entries()].map(([, a]) => a),
    account: (id) => accounts.get(id),
    putAccount: (a) => accounts.put(a.id, a),
    deleteAccount: async (id) => {
      /* Removing an account removes its cached mail with it. Leaving a
         stranger's inbox on disk after they disconnected would be the wrong
         default in any product, and in a sovereignty one it is indefensible. */
      for (const [k, m] of [...messages.entries()]) {
        if (m.accountId === id) await messages.delete(k);
      }
      return accounts.delete(id);
    },

    messages: (accountId, folder) => [...messages.entries()]
      .map(([, m]) => m)
      .filter((m) => (!accountId || m.accountId === accountId) && (!folder || m.folder === folder))
      .sort((a, b) => b.date - a.date),
    message: (id) => messages.get(id),
    async putMessages(list) {
      for (const m of list) await messages.put(m.id, m);
      if (messages.size > MAX_MESSAGES) {
        const stale = [...messages.entries()]
          .map(([k, m]) => ({ k, at: m.date }))
          .sort((a, b) => a.at - b.at)
          .slice(0, messages.size - MAX_MESSAGES);
        for (const s of stale) await messages.delete(s.k);
      }
      return list.length;
    },
  };
}

function memoryStore() {
  const a = new Map(), m = new Map();
  return {
    durable: false,
    close: async () => {},
    accounts: () => [...a.values()],
    account: (id) => a.get(id),
    putAccount: async (x) => a.set(x.id, x),
    deleteAccount: async (id) => {
      for (const [k, v] of [...m.entries()]) if (v.accountId === id) m.delete(k);
      return a.delete(id);
    },
    messages: (accountId, folder) => [...m.values()]
      .filter((x) => (!accountId || x.accountId === accountId) && (!folder || x.folder === folder))
      .sort((x, y) => y.date - x.date),
    message: (id) => m.get(id),
    putMessages: async (list) => { for (const x of list) m.set(x.id, x); return list.length; },
  };
}

/**
 * The entity ids this app contributes to the brain.
 *
 * Deliberately derived from the message itself rather than from the connector,
 * so the same mail through IMAP and through Graph produces the same ids. That
 * is the whole reason `id` is the RFC 5322 Message-ID and not a UID: a UID is
 * per-folder, per-server, and changes when a mailbox is rebuilt.
 */
export function entitiesOf(msg) {
  const out = ["mail:" + msg.id];
  if (msg.from && msg.from.address) out.push("person:" + msg.from.address.toLowerCase());
  for (const t of msg.to || []) if (t.address) out.push("person:" + t.address.toLowerCase());
  if (msg.threadId) out.push("thread:" + msg.threadId);
  return out.slice(0, 12);
}

export { Account, Message };
