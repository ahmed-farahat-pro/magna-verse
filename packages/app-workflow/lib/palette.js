/**
 * The node palette, generated from what is actually installed.
 *
 * The Console shipped a hand-written catalogue of 34 node types covering SAP,
 * Primavera P6, Jira and ServiceNow. None of those systems is connected to
 * anything. That is the most misleading kind of dummy data: not a placeholder
 * label, but a palette that promises capability and would fail — or worse,
 * silently pretend to succeed — the moment someone used it.
 *
 * So the palette is derived. A node type exists here if and only if something
 * on this machine can execute it: a registered harness tool, a command
 * contributed by an installed app, or one of the small set of built-ins this
 * package implements itself (logic, transform, triggers). Remove the Mail
 * plugin and mail nodes stop existing, because the tools stop existing.
 *
 * @module @magna/app-workflow/palette
 */

/* ---- access classification ----------------------------------------------
   `access` decides whether the executor stops and asks a human, so getting it
   wrong in the safe direction is a real failure: a tool classified `none` that
   actually deletes files would run unattended without ever surfacing.

   The rule is therefore fail-closed. A tool nobody has classified is `write`,
   which means it needs approval. Being annoying is recoverable; being silent
   is not. */

import { SYS } from "./sys.js";

/** Drop the executable half — the browser gets descriptors, never functions. */
function stripRun(m) {
  const out = {};
  for (const k of Object.keys(m)) { const { run, ...rest } = m[k]; out[k] = rest; }
  return out;
}

/** Tools whose access is known because they ship with the harness. */
const KNOWN = {
  /* Shell and process control — the sharpest edges in the system. */
  bash: { access: "exec", egress: true, why: "runs a shell command with your permissions" },
  pwsh: { access: "exec", egress: true, why: "runs a PowerShell command with your permissions" },
  job_kill: { access: "exec", egress: false, why: "terminates a running background job" },
  job_list: { access: "read", egress: false, why: "lists background jobs" },
  job_output: { access: "read", egress: false, why: "reads a background job's output" },

  /* Filesystem. */
  read: { access: "read", egress: false, why: "reads a file from disk" },
  read_image: { access: "read", egress: false, why: "reads an image from disk" },
  glob: { access: "read", egress: false, why: "lists files matching a pattern" },
  grep: { access: "read", egress: false, why: "searches file contents" },
  write: { access: "write", egress: false, why: "creates or overwrites a file on disk" },
  edit: { access: "write", egress: false, why: "modifies a file on disk" },
  str_replace_editor: { access: "write", egress: false, why: "modifies a file on disk" },

  /* Network. Egress is the residency question, and it is separate from
     access: web_search writes nothing and still leaves the building. */
  web_fetch: { access: "read", egress: true, why: "fetches a URL — the request leaves this machine" },
  web_search: { access: "read", egress: true, why: "queries a search provider — the query leaves this machine" },

  /* Agent and session surface. */
  agent: { access: "model", egress: false, why: "runs a sub-agent, which may use any tool it has" },
  interrupt_agent: { access: "write", egress: false, why: "interrupts a running agent" },
  send_message: { access: "write", egress: true, why: "sends a message to another agent or session" },
  ask_user_question: { access: "none", egress: false, why: "asks you a question and waits" },

  /* Bookkeeping. */
  todo_write: { access: "write", egress: false, why: "updates the todo list" },
  create_goal: { access: "write", egress: false, why: "creates a goal" },
  update_goal: { access: "write", egress: false, why: "updates a goal" },
  get_goal: { access: "read", egress: false, why: "reads a goal" },
  skill: { access: "read", egress: false, why: "loads a skill's instructions" },

  /* Cordis introspection. `cordis_define`/`cordis_undefine`/`cordis_run`
     reconfigure the running harness — that is as consequential as bash. */
  cordis_inspect_self: { access: "read", egress: false, why: "inspects the running composition" },
  cordis_inspect_list: { access: "read", egress: false, why: "lists composition entries" },
  cordis_inspect_query: { access: "read", egress: false, why: "queries the composition" },
  cordis_define: { access: "exec", egress: false, why: "reconfigures the running harness" },
  cordis_undefine: { access: "exec", egress: false, why: "reconfigures the running harness" },
  cordis_run: { access: "exec", egress: false, why: "executes code inside the harness" },
  cordis_stop: { access: "exec", egress: false, why: "stops part of the running harness" },
};

/** Names that read by convention. Applied only after KNOWN misses. */
const READ_SUFFIX = /_(read|list|search|get|find|show|inspect|status|count|query)$/;
const READ_PREFIX = /^(read|list|search|get|find|show|inspect)_/;

/**
 * Classify one tool.
 *
 * @param name   the registered tool name.
 * @param appMeta optional owning-app facts from the OS registry.
 * @returns {{access:string, egress:boolean, why:string, certain:boolean}}
 */
export function classify(name, appMeta) {
  if (Object.prototype.hasOwnProperty.call(KNOWN, name)) {
    return { ...KNOWN[name], certain: true };
  }

  /* An app that declared its own permissions has already answered this, and it
     is a better source than any guess we could make about its tool names. */
  if (appMeta) {
    const grant = appMeta.permissions && appMeta.permissions.grant ? appMeta.permissions.grant : [];
    const deny = appMeta.permissions && appMeta.permissions.deny ? appMeta.permissions.deny : [];
    const egress = grant.indexOf("net:egress") >= 0 && deny.indexOf("net:egress") < 0;
    if (appMeta.readOnly) {
      return { access: "read", egress, why: "reads from " + appMeta.appId, certain: true };
    }
    if (READ_SUFFIX.test(name) || READ_PREFIX.test(name)) {
      return { access: "read", egress, why: "reads from " + appMeta.appId, certain: true };
    }
    return { access: "write", egress, why: "changes data in " + appMeta.appId, certain: true };
  }

  if (READ_SUFFIX.test(name) || READ_PREFIX.test(name)) {
    return { access: "read", egress: false, why: "reads, by its name", certain: false };
  }

  /* Fail closed. This is the branch that keeps an unclassified tool from
     running unattended: `write` means the approval gate applies. */
  return {
    access: "write",
    egress: false,
    why: "not classified — treated as a write so it always asks first",
    certain: false,
  };
}

/* ---- parameter forms ----------------------------------------------------
   The inspector renders fields from the tool's own JSON Schema, so a node's
   form is whatever the tool actually accepts. No schema means no fields, which
   is honest — better an empty inspector than invented ones. */

/** Map one JSON Schema property onto an inspector field. */
function fieldOf(key, prop) {
  const p = prop || {};
  const base = { k: key, l: p.title || key, hint: p.description || "", req: false };
  if (Array.isArray(p.enum) && p.enum.length) {
    return { ...base, t: "sel", o: p.enum.map(String), d: p.default != null ? String(p.default) : String(p.enum[0]) };
  }
  switch (p.type) {
    case "boolean": return { ...base, t: "check", d: !!p.default };
    case "number": case "integer": return { ...base, t: "num", d: p.default != null ? p.default : "" };
    case "array": case "object": return { ...base, t: "json", d: p.default != null ? JSON.stringify(p.default) : "" };
    default: {
      /* A long free-text parameter wants a textarea, not a one-line input.
         The schema does not say so; the description usually does. */
      const long = /\b(body|content|text|prompt|message|script|command|code|query)\b/i.test(key);
      return { ...base, t: long ? "area" : "text", d: p.default != null ? String(p.default) : "" };
    }
  }
}

/** Build the field list for a tool from its JSON Schema. */
export function fieldsOf(parameters) {
  const schema = parameters || {};
  const props = schema.properties || {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  return Object.keys(props).map((k) => {
    const f = fieldOf(k, props[k]);
    f.req = required.indexOf(k) >= 0;
    return f;
  });
}

/* ---- built-in nodes -----------------------------------------------------
   These are the only nodes this package implements itself. Each one is pure
   control flow or a local transform — none of them reaches the outside world,
   which is why they can exist unconditionally while everything else has to be
   earned by an installed tool. */

const MAIN_IN = [{ id: "main", label: "in" }];
const MAIN_OUT = [{ id: "main", label: "out" }];

export const BUILTINS = {
  "trig.manual": {
    g: "Triggers", name: "Manual", icon: "i-play", tile: "g-auto",
    ins: [], outs: MAIN_OUT, access: "none", egress: false,
    why: "runs only when you press Run",
    params: [],
    sub: () => "on demand",
  },
  "trig.webhook": {
    g: "Triggers", name: "Webhook", icon: "i-plug", tile: "g-auto",
    ins: [], outs: MAIN_OUT, access: "none", egress: false,
    why: "runs when its secret URL is called",
    params: [
      { k: "path", l: "Path segment", t: "text", d: "", hint: "Appended to the generated secret. Optional." },
      { k: "loopbackOnly", l: "Loopback only", t: "check", d: true,
        hint: "Off means anything that can reach this machine can start this workflow." },
    ],
    sub: (d) => (d.loopbackOnly === false ? "network — open" : "loopback only"),
  },
  "trig.cron": {
    g: "Triggers", name: "Schedule", icon: "i-clock", tile: "g-auto",
    ins: [], outs: MAIN_OUT, access: "none", egress: false,
    why: "runs on a timer, with nobody present",
    params: [
      { k: "cron", l: "Cron expression", t: "text", d: "0 6 * * 1-5", hint: "min hour dom mon dow" },
      { k: "tz", l: "Timezone", t: "sel", o: ["Asia/Riyadh", "UTC"], d: "Asia/Riyadh" },
    ],
    sub: (d) => d.cron || "cron",
  },

  "logic.if": {
    g: "Logic", name: "If", icon: "i-git", tile: "g-auto",
    ins: MAIN_IN,
    outs: [{ id: "true", label: "true" }, { id: "false", label: "false" }],
    access: "none", egress: false, why: "compares two values",
    params: [
      { k: "left", l: "Left", t: "text", d: "{{main}}", hint: "Supports {{expr}}" },
      { k: "op", l: "Operator", t: "sel",
        o: ["equals", "not equals", "contains", "greater than", "less than", "is empty", "is not empty"],
        d: "equals" },
      { k: "right", l: "Right", t: "text", d: "" },
    ],
    sub: (d) => (d.op || "equals"),
  },
  "logic.filter": {
    g: "Logic", name: "Filter", icon: "i-sliders", tile: "g-auto",
    ins: MAIN_IN, outs: MAIN_OUT, access: "none", egress: false,
    why: "keeps only the items that match",
    params: [
      /* Most nodes return an object wrapping their list (`sys.list` returns
         {items}, `docs_search` returns {hits}), so a filter that assumed a bare
         array silently matched nothing. Naming the list is explicit rather than
         guessing which property is "the" list. */
      { k: "from", l: "List field", t: "text", d: "", hint: "e.g. items or hits. Blank if the input is already a list." },
      { k: "path", l: "Field", t: "text", d: "", hint: "Property to test on each item" },
      { k: "op", l: "Operator", t: "sel", o: ["equals", "not equals", "contains", "is empty", "is not empty"], d: "contains" },
      { k: "value", l: "Value", t: "text", d: "" },
    ],
    sub: (d) => (d.path ? d.path + " " + (d.op || "") : "filter"),
  },
  "logic.merge": {
    g: "Logic", name: "Merge", icon: "i-layers", tile: "g-auto",
    ins: [{ id: "a", label: "a" }, { id: "b", label: "b" }], outs: MAIN_OUT,
    access: "none", egress: false, why: "combines two inputs",
    params: [{ k: "mode", l: "Mode", t: "sel", o: ["append", "combine object", "pick first"], d: "append" }],
    sub: (d) => d.mode || "append",
  },
  "logic.each": {
    g: "Logic", name: "For each", icon: "i-reload", tile: "g-auto",
    ins: MAIN_IN, outs: [{ id: "item", label: "item" }, { id: "done", label: "done" }],
    access: "none", egress: false, why: "runs the branch once per item",
    params: [
      { k: "path", l: "List field", t: "text", d: "", hint: "Leave blank if the input is already a list" },
      { k: "max", l: "Max items", t: "num", d: 50, hint: "A bound so a bad input cannot run forever" },
    ],
    sub: (d) => "each" + (d.max ? " ≤" + d.max : ""),
  },
  "logic.wait": {
    g: "Logic", name: "Wait", icon: "i-clock", tile: "g-auto",
    ins: MAIN_IN, outs: MAIN_OUT, access: "none", egress: false,
    why: "pauses before continuing",
    params: [{ k: "seconds", l: "Seconds", t: "num", d: 5 }],
    sub: (d) => (d.seconds || 5) + "s",
  },

  "code.transform": {
    g: "Logic", name: "Transform", icon: "i-code", tile: "g-code",
    ins: MAIN_IN, outs: MAIN_OUT,
    /* Arbitrary JavaScript. The runtime it executes in describes itself as
       "not a security boundary", so this is classified `exec` and gated like
       bash — the sandbox shapes the API, it does not contain the code. */
    access: "exec", egress: false,
    why: "runs JavaScript you wrote — the sandbox is not a security boundary",
    params: [
      { k: "code", l: "JavaScript", t: "area", d: "return input;",
        hint: "`input` is the incoming value. Return the outgoing value." },
    ],
    sub: () => "javascript",
  },

  "ai.prompt": {
    g: "AI", name: "Ask a model", icon: "i-spark", tile: "g-brain",
    ins: MAIN_IN, outs: MAIN_OUT, access: "model", egress: false,
    why: "sends the prompt to the selected model",
    params: [
      { k: "prompt", l: "Prompt", t: "area", d: "", hint: "Supports {{main}} for the incoming value" },
      { k: "format", l: "Return", t: "sel", o: ["text", "json"], d: "text" },
    ],
    sub: (d) => (d.format === "json" ? "json out" : "text out"),
  },
};

/* Icons the Console's sprite sheet may not carry. The client falls back to a
   generic glyph rather than rendering an empty <use>, so an unknown id is a
   cosmetic issue and never a broken node. */

/**
 * Build the whole palette.
 *
 * @param toolSchemas  `ctx.tools.schemas()` — every visible tool, right now.
 * @param apps         `os.apps()` — installed app manifests.
 * @returns a map of node type -> descriptor, ready for the inspector.
 */
export function buildPalette(toolSchemas, apps) {
  /* SYS carries its own implementations (see lib/sys.js), so these entries can
     never become a promise with nothing behind them. */
  const cat = { ...BUILTINS, ...stripRun(SYS) };

  /* Which app owns which tool, so a plugin's own declared permissions can
     answer the access question instead of a heuristic. */
  const ownerOf = new Map();
  const readOnlyCmd = new Map();
  for (const a of apps || []) {
    const c = a.contributes || {};
    for (const t of c.tools || []) ownerOf.set(t, a);
    readOnlyCmd.set(a.id, new Set(c.readOnly || []));
  }

  for (const s of toolSchemas || []) {
    const app = ownerOf.get(s.name);
    const meta = app
      ? { appId: app.id, permissions: app.permissions, readOnly: false }
      : null;
    const k = classify(s.name, meta);
    cat["tool." + s.name] = {
      g: app ? app.name : groupFor(s.name),
      name: s.name,
      icon: app ? app.icon : iconFor(s.name),
      tile: app ? app.tile : "g-tool",
      ins: MAIN_IN,
      outs: MAIN_OUT,
      access: k.access,
      egress: k.egress,
      why: k.why,
      certain: k.certain,
      tool: s.name,
      desc: s.description || "",
      params: fieldsOf(s.parameters),
      sub: () => (app ? app.name.toLowerCase() : "tool"),
    };
  }

  /* App commands. These are the same bus a click goes through, so a workflow
     driving Sheets and a person typing in it are indistinguishable downstream
     — which is the whole reason the desktop sits under the harness. */
  for (const a of apps || []) {
    const c = a.contributes || {};
    const ro = readOnlyCmd.get(a.id) || new Set();
    for (const cmd of c.commands || []) {
      const isRead = ro.has(cmd);
      const k = classify(a.id + "_" + cmd, {
        appId: a.id, permissions: a.permissions, readOnly: isRead,
      });
      cat["app." + a.id + "." + cmd] = {
        g: a.name,
        name: a.name + " · " + cmd,
        icon: a.icon, tile: a.tile,
        ins: MAIN_IN, outs: MAIN_OUT,
        access: k.access, egress: k.egress, why: k.why, certain: true,
        appId: a.id, command: cmd,
        desc: "Runs the " + cmd + " command in " + a.name + ".",
        /* An app that describes its command gets a real form. One that does
           not still gets the JSON escape hatch — better an honest blob than
           invented fields that might not match. */
        params: (a.contributes && a.contributes.commandParams && a.contributes.commandParams[cmd])
          ? a.contributes.commandParams[cmd]
          : [{ k: "args", l: "Arguments", t: "json", d: "{}", hint: "JSON passed to the command" }],
        declaredParams: !!(a.contributes && a.contributes.commandParams && a.contributes.commandParams[cmd]),
        sub: () => cmd,
      };
    }
  }

  return cat;
}

/** Coarse grouping for harness tools, so the palette is not one flat list. */
function groupFor(name) {
  if (/^(bash|pwsh|job_)/.test(name)) return "Shell";
  if (/^(read|write|edit|glob|grep|str_replace)/.test(name)) return "Files";
  if (/^web_/.test(name)) return "Web";
  if (/^cordis_/.test(name)) return "Harness";
  if (/^(agent|interrupt_agent|send_message|ask_user)/.test(name)) return "Agents";
  return "Tools";
}

function iconFor(name) {
  if (/^(bash|pwsh)/.test(name)) return "i-term";
  if (/^(read|glob|grep)/.test(name)) return "i-doc";
  if (/^(write|edit|str_replace)/.test(name)) return "i-file";
  if (/^web_/.test(name)) return "i-globe";
  return "i-bolt";
}
