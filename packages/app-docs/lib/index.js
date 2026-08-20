import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";

/**
 * Docs — a layer-3 app plugin.
 *
 * This package is the smallest complete example of the contract, and it is
 * deliberately small: an app is a manifest, a command handler, a browser half,
 * and some tools. It reaches the OS and nothing else — no `ctx.webServer`, no
 * `ctx.sessions`, no other app's state. If it wanted any of those it would not
 * be an app, it would be a second OS.
 *
 * The document store lives on the host rather than in the browser on purpose.
 * The agent writing a document through `docs_create` and a person typing into
 * the window are then editing the same thing, which is the point of putting the
 * desktop underneath the harness rather than beside it.
 *
 * @module @magna/app-docs
 */

export const name = "magna-app-docs";

/**
 * `magnaOS` is the app's only dependency and the reason ordering never has to
 * be managed: Cordis holds this plugin until layer 2 publishes the service.
 * `tools` is separate because the tools are contributed to the harness, not to
 * the OS.
 */
export const inject = ["magnaOS", "tools"];

const HERE = dirname(fileURLToPath(import.meta.url));

/** Seeded so a fresh desktop has something to look at. */
function seed() {
  const now = Date.now();
  return [
    {
      id: "doc-welcome",
      title: "Welcome",
      body:
        "This document lives in the harness, not in the browser.\n\n" +
        "Ask the agent to add a line to it and watch this window change - it is " +
        "the same store, reached through the same command bus.",
      created: now,
      modified: now,
    },
  ];
}

export function apply(ctx) {
  const os = ctx.magnaOS;

  /** @type {Map<string, object>} */
  const docs = new Map(seed().map((d) => [d.id, d]));
  let counter = 0;

  const nextId = () => "doc-" + (++counter) + "-" + Date.now().toString(36);

  /* ---- the command bus ---------------------------------------------------
     One handler for every way the app can be driven. The browser reaches it
     through POST /desktop/__os/invoke and the model through the os_invoke
     tool, so there is exactly one implementation of each command and no
     possibility of the two paths diverging. */
  async function invoke(command, args) {
    switch (command) {
      case "list":
        return {
          docs: [...docs.values()]
            .sort((a, b) => b.modified - a.modified)
            .map((d) => ({ id: d.id, title: d.title, modified: d.modified })),
        };

      case "read": {
        const d = docs.get(args.id);
        if (!d) throw new Error('docs: no document "' + args.id + '"');
        return d;
      }

      case "create": {
        const id = nextId();
        const now = Date.now();
        const doc = {
          id,
          title: (args.title || "Untitled").slice(0, 200),
          body: args.body || "",
          created: now,
          modified: now,
        };
        docs.set(id, doc);
        return { id, title: doc.title };
      }

      /**
       * Save into a document — existing or new, in one call.
       *
       * `create` and `append` each answer half the question, and a caller
       * generating UI (the Workflow palette) had to make the user choose the
       * verb before knowing whether the document exists. This takes a target
       * and decides: empty target means create, otherwise replace or append.
       *
       * That collapse is the whole point — "save the model's answer into a
       * document" is one intent, and it should be one node.
       */
      case "save": {
        const body = args.body == null ? "" : String(args.body);
        const target = String(args.target || "").trim();

        if (!target) {
          const id = nextId();
          const now = Date.now();
          /* Title falls back to the first line of the content rather than
             "Untitled": a workflow that writes ten documents should not produce
             ten identically-named ones. */
          const firstLine = body.split("\n").map((l) => l.trim()).filter(Boolean)[0] || "";
          const title = (String(args.title || "").trim() || firstLine.slice(0, 60) || "Untitled").slice(0, 200);
          docs.set(id, { id, title, body, created: now, modified: now });
          return { id, title, created: true, length: body.length };
        }

        const d = docs.get(target);
        if (!d) throw new Error('docs: no document "' + target + '" — it may have been deleted');
        if (args.mode === "append") {
          d.body = d.body + (d.body.endsWith("\n") || d.body === "" ? "" : "\n") + body;
        } else {
          d.body = body;
        }
        if (String(args.title || "").trim()) d.title = String(args.title).trim().slice(0, 200);
        d.modified = Date.now();
        return { id: d.id, title: d.title, created: false, length: d.body.length };
      }

      case "append": {
        const d = docs.get(args.id);
        if (!d) throw new Error('docs: no document "' + args.id + '"');
        d.body = d.body + (d.body.endsWith("\n") || d.body === "" ? "" : "\n") + (args.text || "");
        d.modified = Date.now();
        return { id: d.id, length: d.body.length };
      }

      case "write": {
        const d = docs.get(args.id);
        if (!d) throw new Error('docs: no document "' + args.id + '"');
        if (typeof args.body === "string") d.body = args.body;
        if (typeof args.title === "string") d.title = args.title.slice(0, 200);
        d.modified = Date.now();
        return { id: d.id, length: d.body.length };
      }

      case "search": {
        /* Substring, case-insensitive, over title and body. Deliberately not a
           vector index: the corpus is the user's own live documents, exact
           match is explainable, and the agent can iterate on the query rather
           than trusting one similarity ranking. */
        const q = String(args.q || "").trim().toLowerCase();
        if (!q) return { hits: [] };
        const hits = [];
        for (const d of docs.values()) {
          const hay = (d.title + "\n" + d.body).toLowerCase();
          const at = hay.indexOf(q);
          if (at < 0) continue;
          hits.push({
            id: d.id, title: d.title,
            /* A snippet around the match, so the model sees why it matched
               rather than only that it did. */
            snippet: (d.title + "\n" + d.body).slice(Math.max(0, at - 60), at + 140).replace(/\s+/g, " ").trim(),
          });
        }
        return { hits: hits.slice(0, 20) };
      }

      case "delete": {
        if (!docs.delete(args.id)) throw new Error('docs: no document "' + args.id + '"');
        return { deleted: args.id };
      }

      default:
        throw new Error('docs: unknown command "' + command + '"');
    }
  }

  /* ---- registration ------------------------------------------------------
     One call. The disposer it returns is bound to this plugin's fiber, so
     `dsh plugin remove @magna/app-docs` takes the dock entry, the desktop
     icon, the asset route and the command handler with it. */
  const dispose = os.registerApp({
    id: "docs",
    name: "Docs",
    publisher: "Magna",
    version: "0.1.0",
    pkg: "@magna/app-docs",
    icon: "i-docs",
    tile: "g-docs",
    window: { w: 780, h: 600, minW: 420, minH: 320, multi: false },
    placement: { dock: true, desktop: true, order: 20 },
    aliases: ["docs", "document", "documents", "write", "notes"],
    permissions: { grant: ["docs:read", "docs:write"], deny: ["fs:write", "net:egress"] },
    contributes: {
      tools: ["docs_list", "docs_search", "docs_create", "docs_read", "docs_append"],
      commands: ["list", "read", "search", "save", "create", "append", "write", "delete"],
      /* Commands that only read. Polling these must not enter the journal. */
      readOnly: ["list", "read", "search"],
      /* How these commands look as a form, so callers that generate UI — the
         Workflow palette today — can offer real fields instead of asking for a
         hand-written JSON blob. `pick` resolves its options by calling the
         command named in `from`, so the list is always the documents that
         exist right now rather than a snapshot. */
      commandParams: {
        save: [
          { k: "target", l: "Document", t: "pick", d: "",
            from: { command: "list", list: "docs", value: "id", label: "title",
                    empty: "\u002B  New document" },
            hint: "Pick one, or leave it on New document to create one." },
          { k: "title", l: "Title", t: "text", d: "",
            hint: "For a new document. Blank uses the first line of the content." },
          { k: "body", l: "Content", t: "area", d: "{{main}}",
            hint: "{{main}} is whatever the previous node produced." },
          { k: "mode", l: "If it already exists", t: "sel", o: ["replace", "append"], d: "replace" },
        ],
        create: [
          { k: "title", l: "Title", t: "text", d: "", req: true },
          /* Defaults to the incoming value: the overwhelmingly common wiring is
             something upstream producing text that belongs in a new document. */
          { k: "body", l: "Body", t: "area", d: "{{main}}",
            hint: "{{main}} is whatever the previous node produced." },
        ],
        append: [
          { k: "id", l: "Document", t: "pick", d: "",
            from: { command: "list", list: "docs", value: "id", label: "title" },
            hint: "An existing document. Use Create for a new one." },
          { k: "text", l: "Text to append", t: "area", d: "{{main}}" },
        ],
        write: [
          { k: "id", l: "Document", t: "pick", d: "",
            from: { command: "list", list: "docs", value: "id", label: "title" } },
          { k: "title", l: "New title", t: "text", d: "", hint: "Leave blank to keep it." },
          { k: "body", l: "Body (replaces everything)", t: "area", d: "{{main}}" },
        ],
        read: [
          { k: "id", l: "Document", t: "pick", d: "",
            from: { command: "list", list: "docs", value: "id", label: "title" } },
        ],
        search: [{ k: "q", l: "Keyword", t: "text", d: "", req: true }],
        delete: [
          { k: "id", l: "Document", t: "pick", d: "",
            from: { command: "list", list: "docs", value: "id", label: "title" } },
        ],
      },
    },
    clientRoot: resolve(HERE, "..", "client"),
    clientEntry: "app.js",
  }, invoke);

  /* The scoped handle stamps `appId` itself, so this app cannot log activity in
     another app's name even if it tried. */
  const scope = dispose.scope;

  /* ---- tools -------------------------------------------------------------
     Prefixed by owner. The harness tool registry is one flat namespace and
     duplicate registration throws, so `create` would collide with the first
     other app that wants it. */

  ctx.effect(() => ctx.tools.register(defineTool({
    name: "docs_list",
    description: "List the documents in the user's MagnaVERSE Docs app, newest first.",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          docs: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
              properties: { id: { type: "string" }, title: { type: "string" } },
            },
          },
        },
      },
      render: (_a, v) => [{
        type: "text",
        text: v.docs.length
          ? "Documents: " + v.docs.map((d) => d.title + " (" + d.id + ")").join("; ")
          : "There are no documents yet.",
      }],
    },
    execute: () => invoke("list", {}),
    presentCall: () => ({ card: "generic", title: "List documents", kind: "other" }),
  })), "app-docs: tool docs_list");

  ctx.effect(() => ctx.tools.register(defineTool({
    name: "docs_create",
    description:
      "Create a new document in the user's Docs app and return its id. The document appears " +
      "in their Docs window immediately.",
    parameters: {
      title: { type: "string", required: true, description: "Document title." },
      body: { type: "string", description: "Initial contents. May be empty." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { id: { type: "string" }, title: { type: "string" } },
      },
      render: (_a, v) => [{ type: "text", text: 'Created "' + v.title + '" as ' + v.id + "." }],
    },
    async execute(args, exec) {
      const r = await invoke("create", args);
      scope.observe({ actor: "agent",
        verb: "create", target: r.id, summary: 'created "' + r.title + '"',
        sessionId: exec && exec.agent ? exec.agent.session.id : null, });
      return r;
    },
    presentCall: (a) => ({ card: "generic", title: 'Create "' + a.title + '"', kind: "other", rawInput: a }),
  })), "app-docs: tool docs_create");

  ctx.effect(() => ctx.tools.register(defineTool({
    name: "docs_read",
    description: "Read one document from the user's Docs app by id. Use docs_list to find ids.",
    parameters: { id: { type: "string", required: true, description: "The document id." } },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: { id: { type: "string" }, title: { type: "string" }, body: { type: "string" } },
      },
      render: (_a, v) => [{ type: "text", text: "# " + v.title + "\n\n" + v.body }],
    },
    async execute(args, exec) {
      const r = await invoke("read", args);
      scope.observe({ actor: "agent",
        verb: "read", target: r.id, summary: 'read "' + r.title + '"',
        sessionId: exec && exec.agent ? exec.agent.session.id : null, });
      return r;
    },
    presentCall: (a) => ({ card: "generic", title: "Read " + a.id, kind: "other", rawInput: a }),
  })), "app-docs: tool docs_read");

  ctx.effect(() => ctx.tools.register(defineTool({
    name: "docs_append",
    description: "Append text to the end of an existing document in the user's Docs app.",
    parameters: {
      id: { type: "string", required: true, description: "The document id." },
      text: { type: "string", required: true, description: "Text to append." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { id: { type: "string" }, length: { type: "number" } },
      },
      render: (_a, v) => [{ type: "text", text: "Appended. " + v.id + " is now " + v.length + " characters." }],
    },
    async execute(args, exec) {
      const r = await invoke("append", args);
      scope.observe({ actor: "agent",
        verb: "write", target: r.id, summary: "appended to " + r.id,
        sessionId: exec && exec.agent ? exec.agent.session.id : null, });
      return r;
    },
    presentCall: (a) => ({ card: "generic", title: "Append to " + a.id, kind: "other", rawInput: a }),
  })), "app-docs: tool docs_append");

  ctx.effect(() => ctx.tools.register(defineTool({
    name: "docs_search",
    description:
      "Search the user's documents by keyword and get back matching ids with a snippet showing " +
      "why each matched. Prefer this over listing everything when you are looking for something " +
      "specific — then docs_read the one you want. Search again with a different word if the " +
      "first query misses; that is cheaper and more accurate than reading every document.",
    parameters: { q: { type: "string", required: true, description: "Keyword or phrase." } },
    output: {
      schema: {
        type: "object", additionalProperties: false,
        properties: { hits: { type: "array", items: { type: "object", additionalProperties: true,
          properties: { id: { type: "string" }, title: { type: "string" }, snippet: { type: "string" } } } } },
      },
      render: (a, v) => [{ type: "text", text: v.hits.length
        ? v.hits.map((h) => h.title + " (" + h.id + "): …" + h.snippet + "…").join("\n")
        : 'Nothing matched "' + a.q + '".' }],
    },
    async execute(args, exec) {
      const r = await invoke("search", args);
      scope.observe({ actor: "agent", verb: "read", target: args.q, summary: 'searched documents for "' + args.q + '"',
                      sessionId: exec && exec.agent ? exec.agent.session.id : null });
      return r;
    },
    presentCall: (a) => ({ card: "generic", title: 'Search documents for "' + a.q + '"', kind: "other", rawInput: a }),
  })), "app-docs: tool docs_search");

  console.log("[app-docs] layer 3 registered - 7 commands, 5 tools");
}
