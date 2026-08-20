/**
 * Turning harness session events into brain actions.
 *
 * The previous tap kept `{sessionId, type}` and dropped `event.data` — every
 * tool name, argument, approval outcome and message body went on the floor.
 * Half the brain was missing at the door.
 *
 * What is kept here is deliberately narrow. The session log already holds the
 * full record and `sessionQuery` can search it, so copying bodies would be
 * duplicating the source of truth while burning disk. What the brain needs is
 * the SHAPE of what happened plus the identifiers to join on — not the content.
 */

/* Argument names that carry an identifier worth linking on. Structured first;
   pattern extraction is a separate pass in entities.js. */
const ID_ARGS = ["id", "ref", "path", "file", "appId", "command", "target", "key", "messageId"];

/** Entity keys implied by a tool call, from its name and arguments. */
export function entitiesFromCall(tool, args) {
  const out = [];
  const a = args || {};
  const push = (k) => { if (k && out.indexOf(k) < 0) out.push(k); };

  /* An app's own tools name their own entity kind: docs_read -> doc:, and
     sheets_set -> sheet:. The prefix convention the tool registry forced on us
     for collision reasons turns out to carry the type for free. */
  const owner = /^([a-z]+)_/.exec(tool || "");
  const kind = owner ? { docs: "doc", sheets: "sheet", mail: "mail", os: "app" }[owner[1]] : null;

  for (const k of ID_ARGS) {
    const v = a[k];
    if (typeof v !== "string" || !v || v.length > 200) continue;
    if (k === "path" || k === "file") push("file:" + v);
    else if (kind) push(kind + ":" + v);
  }
  return out.slice(0, 12);
}

/**
 * Project one session event onto the action envelope, or null to ignore it.
 *
 * @param session the Session the event belongs to
 * @param event   the durable session event
 */
export function actionFromEvent(session, event) {
  const sessionId = (session && session.id) || null;
  const d = (event && event.data) || {};
  const base = { actor: "agent", appId: "agent", sessionId };

  switch (event.type) {
    case "tool/call": {
      const tool = d.name || "a tool";
      const args = d.args || d.input || {};
      /* Argument KEYS, never values: an argument can hold a document body or a
         credential, and the brain has no business storing either. */
      const shape = Object.keys(args).slice(0, 8).join(", ");
      return Object.assign({}, base, {
        verb: "run", target: tool,
        summary: tool + (shape ? " (" + shape + ")" : ""),
        entities: entitiesFromCall(tool, args),
      });
    }

    case "tool/result": {
      /* Size and success, not the body. A failing tool is the interesting
         signal; a 40 KB result is not worth copying out of the log. */
      const err = d.isError || (d.message && d.message.isError);
      return Object.assign({}, base, {
        verb: err ? "blocked" : "read",
        target: d.name || "result",
        summary: err ? "a tool call failed" : "a tool call returned",
      });
    }

    case "approval/asked":
      return Object.assign({}, base, {
        verb: "needs", target: d.toolName || d.tool || "a tool",
        summary: "asked to run " + (d.toolName || "a tool") +
                 (d.reason ? " — " + String(d.reason).slice(0, 140) : ""),
      });

    case "approval/decided":
      return Object.assign({}, base, {
        /* A decision is the user's, not the agent's, even though it is recorded
           on the agent's session. Attributing it to the agent would let the
           brain conclude the user approves of everything. */
        actor: "human",
        verb: d.outcome === "rejected" ? "blocked" : "run",
        target: "approval",
        summary: "you " + (d.outcome === "rejected" ? "rejected" : "allowed") + " a tool call",
      });

    case "user/message": {
      const txt = (d.content || [])
        .filter((c) => c && c.type === "text")
        .map((c) => c.text).join(" ").trim();
      /* Injected scaffolding is not the user speaking. Runtime-context
         snapshots (ours and the harness's), system reminders, schedule
         framings and compaction checkpoints all arrive as user-role messages;
         recording them as intent makes the brain read its own output back as
         something the user asked for. */
      if (!txt) return null;
      if (/^Current runtime context\./.test(txt)) return null;
      if (/^<(system-reminder|compacted-summary)/.test(txt)) return null;
      if (/^\[SCHEDULE REMINDER/.test(txt)) return null;
      if (/^This is an automatically generated checkpoint/.test(txt)) return null;
      return Object.assign({}, base, {
        actor: "human", appId: "chat", verb: "create", target: "prompt",
        summary: txt.slice(0, 200),
      });
    }

    case "turn/end":
      return Object.assign({}, base, {
        verb: (d.reason && d.reason.kind) === "error" ? "blocked" : "done",
        target: "turn",
        summary: (d.reason && d.reason.kind) === "error"
          ? "a turn failed: " + String((d.reason.error && d.reason.error.message) || "").slice(0, 120)
          : "a turn completed",
      });

    /* Everything else — chunks, steps, titles, headers — is machinery. The log
       still has it if anyone needs it. */
    default:
      return null;
  }
}
