import nodemailer from "nodemailer";

/**
 * Sending, over SMTP.
 *
 * This is the first thing in the whole system that reaches another human. A
 * workflow that writes a file can be undone; a message that has left the server
 * cannot. So `mail_send` is gated unconditionally — not by an access class that
 * could be reclassified, and not by a capability grant that a scheduled run
 * could satisfy in advance. There is no configuration in which this sends
 * without someone saying yes to the actual recipients and the actual text.
 *
 * @module @magna/app-mail/smtp
 */

/** Turn "Name <a@b.c>" or "a@b.c" into what nodemailer wants, and validate it. */
export function parseAddressList(raw) {
  const list = String(raw || "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const one of list) {
    const m = /^(.*?)<([^>]+)>$/.exec(one);
    const address = (m ? m[2] : one).trim();
    const name = m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
    /* Deliberately strict rather than clever: a typo'd recipient is a message
       sent to the wrong person or bounced hours later, and neither is
       recoverable by the time anyone notices. */
    if (!/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(address)) {
      throw new Error('"' + one + '" is not a valid email address');
    }
    out.push(name ? { name, address } : { address });
  }
  return out;
}

function transport(account, secret) {
  const host = account.smtpHost || account.host.replace(/^imap\./, "smtp.");
  const port = account.smtpPort || 587;
  return nodemailer.createTransport({
    host,
    port,
    /* Port 465 is implicit TLS; 587 starts plaintext and upgrades with
       STARTTLS. Getting this backwards produces a hang rather than an error,
       so it is derived from the port rather than left to a checkbox. */
    secure: account.smtpSecure === true || port === 465,
    requireTLS: port === 587,
    auth: { user: account.user, pass: secret },
    connectionTimeout: 20000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
}

/**
 * Check the SMTP side without sending anything.
 *
 * Worth its own call because IMAP and SMTP are different servers with different
 * ports and often different rules — a mailbox that reads fine can still refuse
 * to send, and finding that out at the moment someone presses Send is the worst
 * time to find it out.
 */
export async function verifySend(account, secret) {
  const t = transport(account, secret);
  try {
    await t.verify();
    return { ok: true, host: account.smtpHost || account.host, port: account.smtpPort || 587 };
  } catch (e) {
    throw new Error(describeSmtpError(e));
  } finally {
    t.close();
  }
}

export async function send(account, secret, msg) {
  const to = parseAddressList(msg.to);
  if (!to.length) throw new Error("mail: no recipient");
  const cc = msg.cc ? parseAddressList(msg.cc) : [];
  const bcc = msg.bcc ? parseAddressList(msg.bcc) : [];

  const t = transport(account, secret);
  try {
    const info = await t.sendMail({
      from: account.address ? { name: account.label || "", address: account.address } : account.user,
      to, cc, bcc,
      subject: String(msg.subject || ""),
      /* Text only, both ways. The reader renders text and the composer writes
         text, so there is no path by which markup from somewhere else is
         forwarded on under the user's name. */
      text: String(msg.body || ""),
      inReplyTo: msg.inReplyTo ? "<" + String(msg.inReplyTo).replace(/^<|>$/g, "") + ">" : undefined,
      references: msg.references ? String(msg.references) : undefined,
    });
    return {
      /* The server's own Message-ID, so a sent message resolves to the same
         entity as the copy that later appears in the Sent folder. */
      messageId: String(info.messageId || "").replace(/^<|>$/g, ""),
      accepted: (info.accepted || []).map(String),
      rejected: (info.rejected || []).map(String),
      response: String(info.response || ""),
    };
  } catch (e) {
    throw new Error(describeSmtpError(e));
  } finally {
    t.close();
  }
}

/** SMTP failures are numeric codes; say what they mean. */
export function describeSmtpError(e) {
  const code = e.responseCode || e.code;
  if (code === "EAUTH" || code === 535 || code === 534) {
    return "The SMTP server rejected those credentials. Many providers need an app password for sending too" +
           (e.response ? " — " + e.response : "") + ".";
  }
  if (code === "ECONNECTION" || code === "ESOCKET") {
    return "Could not reach the SMTP server. Check the host and port" +
           (e.port ? " (tried port " + e.port + ")" : "") + ".";
  }
  if (code === "ETIMEDOUT" || code === "ECONNECTION") {
    return "The SMTP server did not answer. Port 465 needs implicit TLS; port 587 needs STARTTLS.";
  }
  if (code === 550 || code === 553) {
    return "The server refused the recipient or the sender address" + (e.response ? " — " + e.response : "") + ".";
  }
  if (code === 554) return "The server rejected the message" + (e.response ? " — " + e.response : "") + ".";
  return e.response || e.message || "The SMTP server refused the message.";
}
