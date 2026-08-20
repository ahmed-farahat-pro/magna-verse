/**
 * The Microsoft 365 connector.
 *
 * No SDK. Device-code OAuth is four HTTP calls and Graph is REST, so a
 * dependency would add a supply chain for no capability — and this runs inside
 * a harness whose whole premise is that you can see what leaves the machine.
 *
 * The device-code flow is chosen over the authorization-code flow deliberately:
 * it needs no redirect URI, no local callback server, and no browser embedded
 * in the desktop. The user is shown a code, signs in wherever they like, and
 * this polls. That also means the password is never typed into anything we
 * wrote, which is the right property for a corporate tenant.
 *
 * Everything here resolves to the SAME entity ids as the IMAP connector,
 * because Graph exposes `internetMessageId` — the RFC 5322 Message-ID. One
 * message seen both ways is one node in the brain, not two.
 *
 * @module @magna/app-mail/graph
 */

const LOGIN = "https://login.microsoftonline.com";
const GRAPH = "https://graph.microsoft.com/v1.0";

/**
 * Delegated permissions this asks for.
 *
 * `offline_access` is what makes a refresh token possible; without it the
 * connection dies in an hour and the user is asked to sign in again forever.
 * `Mail.Send` is requested only when sending is wanted, so a read-only
 * connection genuinely cannot send.
 */
export const SCOPES_READ = ["offline_access", "User.Read", "Mail.Read"];
export const SCOPES_SEND = ["offline_access", "User.Read", "Mail.Read", "Mail.Send"];

const tenantUrl = (tenant) => LOGIN + "/" + encodeURIComponent(tenant || "common");

async function post(url, form) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

/**
 * Step 1 — ask Microsoft for a device code.
 *
 * Returns the code and the URL to type it into. The caller shows both and then
 * polls `pollForToken`.
 */
export async function startDeviceCode(tenant, clientId, wantSend) {
  if (!clientId) throw new Error("Microsoft 365 needs the Application (client) ID from your app registration.");
  const { status, body } = await post(tenantUrl(tenant) + "/oauth2/v2.0/devicecode", {
    client_id: clientId,
    scope: (wantSend ? SCOPES_SEND : SCOPES_READ).join(" "),
  });
  if (status !== 200) throw new Error(describeOAuthError(body, "could not start sign-in"));
  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUri: body.verification_uri,
    expiresIn: body.expires_in,
    interval: body.interval || 5,
    message: body.message,
  };
}

/**
 * Step 2 — poll until the user finishes signing in.
 *
 * `authorization_pending` is the normal case and must not be treated as an
 * error; `slow_down` means back off. Both are part of the protocol rather than
 * failures, and a client that gives up on the first non-200 never completes a
 * single sign-in.
 */
export async function pollForToken(tenant, clientId, deviceCode, opts) {
  const started = Date.now();
  const limitMs = ((opts && opts.expiresIn) || 900) * 1000;
  let interval = ((opts && opts.interval) || 5) * 1000;
  const signal = opts && opts.signal;

  for (;;) {
    if (signal && signal.aborted) throw new Error("Sign-in was cancelled.");
    if (Date.now() - started > limitMs) throw new Error("The sign-in code expired. Start again.");
    await new Promise((r) => setTimeout(r, interval));

    const { status, body } = await post(tenantUrl(tenant) + "/oauth2/v2.0/token", {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: clientId,
      device_code: deviceCode,
    });
    if (status === 200) return normaliseToken(body);
    if (body.error === "authorization_pending") continue;
    if (body.error === "slow_down") { interval += 5000; continue; }
    if (body.error === "expired_token") throw new Error("The sign-in code expired. Start again.");
    if (body.error === "authorization_declined") throw new Error("Sign-in was declined.");
    throw new Error(describeOAuthError(body, "sign-in failed"));
  }
}

/** Exchange a refresh token for a fresh access token. */
export async function refresh(tenant, clientId, refreshToken, wantSend) {
  const { status, body } = await post(tenantUrl(tenant) + "/oauth2/v2.0/token", {
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: refreshToken,
    scope: (wantSend ? SCOPES_SEND : SCOPES_READ).join(" "),
  });
  if (status !== 200) throw new Error(describeOAuthError(body, "could not refresh the connection"));
  return normaliseToken(body);
}

function normaliseToken(body) {
  return {
    accessToken: body.access_token,
    /* Microsoft may or may not return a new refresh token; keeping the old one
       when it does not is required, or the connection dies on the next
       refresh. */
    refreshToken: body.refresh_token || null,
    expiresAt: Date.now() + (Number(body.expires_in || 3600) - 60) * 1000,
    scope: body.scope || "",
  };
}

async function graphGet(accessToken, path) {
  const res = await fetch(GRAPH + path, {
    headers: { authorization: "Bearer " + accessToken },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(describeGraphError(body, res.status));
  return body;
}

export async function me(accessToken) {
  const r = await graphGet(accessToken, "/me?$select=displayName,mail,userPrincipalName");
  return { name: r.displayName || "", address: (r.mail || r.userPrincipalName || "").toLowerCase() };
}

export async function listFolders(accessToken) {
  const r = await graphGet(accessToken, "/me/mailFolders?$top=50&$select=id,displayName,totalItemCount");
  return (r.value || []).map((f) => ({
    path: f.id, name: f.displayName, specialUse: null, subscribed: true, count: f.totalItemCount,
  }));
}

/** Graph message -> the same flat shape the IMAP connector produces. */
function flatten(m, accountId, folder) {
  const addr = (a) => ({
    name: (a && a.emailAddress && a.emailAddress.name) || "",
    address: ((a && a.emailAddress && a.emailAddress.address) || "").toLowerCase(),
  });
  /* internetMessageId IS the RFC 5322 Message-ID, which is what makes a message
     seen through Graph and through IMAP resolve to one entity. Falling back to
     Graph's own id would produce two nodes for one message. */
  const id = String(m.internetMessageId || m.id || "").replace(/^<|>$/g, "");
  return {
    id,
    accountId,
    folder: folder || "inbox",
    uid: null,
    threadId: String(m.conversationId || id),
    subject: String(m.subject || ""),
    from: addr(m.from || m.sender),
    to: (m.toRecipients || []).map(addr),
    cc: (m.ccRecipients || []).map(addr),
    date: m.receivedDateTime ? new Date(m.receivedDateTime).getTime() : Date.now(),
    seen: !!m.isRead,
    flagged: !!(m.flag && m.flag.flagStatus === "flagged"),
    hasAttachments: !!m.hasAttachments,
    preview: String(m.bodyPreview || "").replace(/\s+/g, " ").slice(0, 200),
    body: m.body && m.body.contentType === "text" ? String(m.body.content || "") : "",
  };
}

const LIST_FIELDS =
  "id,internetMessageId,conversationId,subject,from,sender,toRecipients,ccRecipients," +
  "receivedDateTime,isRead,hasAttachments,bodyPreview,flag";

export async function fetchRecent(accessToken, accountId, folder, limit) {
  const f = folder && folder !== "INBOX" ? folder : "inbox";
  const n = Math.max(1, Math.min(200, limit || 50));
  const r = await graphGet(accessToken,
    "/me/mailFolders/" + encodeURIComponent(f) + "/messages" +
    "?$top=" + n + "&$orderby=receivedDateTime desc&$select=" + LIST_FIELDS);
  return (r.value || []).map((m) => flatten(m, accountId, f));
}

export async function search(accessToken, accountId, query, limit) {
  const n = Math.max(1, Math.min(100, limit || 25));
  /* $search hits the whole mailbox, which is the point — the cache only holds
     what is recent. It cannot be combined with $orderby in Graph, so the sort
     happens here instead. */
  const r = await graphGet(accessToken,
    "/me/messages?$search=" + encodeURIComponent('"' + String(query).replace(/"/g, "") + '"') +
    "&$top=" + n + "&$select=" + LIST_FIELDS);
  return (r.value || []).map((m) => flatten(m, accountId, "inbox")).sort((a, b) => b.date - a.date);
}

export async function fetchBody(accessToken, graphId) {
  const r = await graphGet(accessToken, "/me/messages/" + encodeURIComponent(graphId) + "?$select=body,bodyPreview");
  const content = String((r.body && r.body.content) || "");
  const isHtml = r.body && r.body.contentType === "html";
  return {
    text: isHtml ? stripHtml(content) : content.trim(),
    html: !!isHtml,
    attachments: [],
  };
}

export async function send(accessToken, msg, toList, ccList) {
  const rec = (l) => (l || []).map((a) => ({ emailAddress: { address: a.address, name: a.name || undefined } }));
  const res = await fetch(GRAPH + "/me/sendMail", {
    method: "POST",
    headers: { authorization: "Bearer " + accessToken, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: String(msg.subject || ""),
        body: { contentType: "Text", content: String(msg.body || "") },
        toRecipients: rec(toList),
        ccRecipients: rec(ccList),
      },
      saveToSentItems: true,
    }),
  });
  if (res.status === 202) return { accepted: (toList || []).map((a) => a.address), messageId: "", response: "accepted" };
  const body = await res.json().catch(() => ({}));
  throw new Error(describeGraphError(body, res.status));
}

/** Minimal HTML-to-text. Only ever used on content that stays as text. */
function stripHtml(html) {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Azure AD errors are precise and their messages are long. The two that
 * actually happen during setup are worth naming, because both are things the
 * user has to fix in the portal and neither is obvious from the raw text.
 */
export function describeOAuthError(body, prefix) {
  const code = body && body.error;
  const desc = (body && body.error_description) || "";
  if (code === "invalid_client" || /AADSTS7000218|AADSTS700016/.test(desc)) {
    return "That client ID was not found in the tenant, or the app registration is not set up for public " +
           "clients. In Azure AD, enable 'Allow public client flows' on the app registration.";
  }
  if (/AADSTS65001/.test(desc)) {
    return "Nobody has consented to these permissions yet. An administrator may need to grant Mail.Read " +
           "for this app registration.";
  }
  if (/AADSTS900023|AADSTS90002/.test(desc)) return "That tenant was not found. Check the tenant ID or domain.";
  return prefix + (desc ? ": " + desc.split("\n")[0] : code ? ": " + code : ".");
}

export function describeGraphError(body, status) {
  const e = body && body.error;
  const msg = (e && e.message) || "";
  if (status === 401) return "Microsoft rejected the access token. Reconnect the account.";
  if (status === 403) {
    return "Microsoft refused the request: this app registration is missing a permission" +
           (msg ? " — " + msg : "") + ".";
  }
  if (status === 429) return "Microsoft is rate-limiting this connection. Try again shortly.";
  return msg || "Microsoft Graph refused the request (HTTP " + status + ").";
}
