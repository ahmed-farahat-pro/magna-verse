import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";

/**
 * Sheets — a layer-3 app plugin.
 *
 * Exists mainly to prove the contract holds for a second app with a different
 * data shape: a grid rather than a document, addressed by A1 references. The
 * grid lives on the host, so a formula the agent writes and a cell the user
 * types land in the same store.
 *
 * @module @magna/app-sheets
 */

export const name = "magna-app-sheets";
export const inject = ["magnaOS", "tools"];

const HERE = dirname(fileURLToPath(import.meta.url));
const COLS = 8;
const ROWS = 24;

/** "B4" -> {c:1, r:3}. Returns null for anything that is not a plain A1 ref. */
function parseRef(ref) {
  const m = /^([A-Za-z]+)(\d+)$/.exec(String(ref || "").trim());
  if (!m) return null;
  let c = 0;
  const letters = m[1].toUpperCase();
  for (let i = 0; i < letters.length; i++) c = c * 26 + (letters.charCodeAt(i) - 64);
  c -= 1;
  const r = parseInt(m[2], 10) - 1;
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
  return { c, r };
}

const colName = (c) => String.fromCharCode(65 + c);

export function apply(ctx) {
  const os = ctx.magnaOS;

  /** Sparse cell store, keyed "c,r". */
  const cells = new Map();
  const key = (c, r) => c + "," + r;

  function setCell(ref, value) {
    const p = parseRef(ref);
    if (!p) throw new Error('sheets: "' + ref + '" is not a cell in this sheet (A1 to ' + colName(COLS - 1) + ROWS + ")");
    if (value === "" || value == null) cells.delete(key(p.c, p.r));
    else cells.set(key(p.c, p.r), String(value));
    return { ref: ref.toUpperCase(), value: value == null ? "" : String(value) };
  }

  function grid() {
    const rows = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) row.push(cells.get(key(c, r)) || "");
      rows.push(row);
    }
    return { cols: COLS, rows: ROWS, colNames: Array.from({ length: COLS }, (_, i) => colName(i)), data: rows };
  }

  /** Only the populated cells — what the model should see, rather than 192 blanks. */
  function used() {
    const out = [];
    for (const [k, v] of cells) {
      const [c, r] = k.split(",").map(Number);
      out.push({ ref: colName(c) + (r + 1), value: v });
    }
    return out.sort((a, b) => a.ref.localeCompare(b.ref));
  }

  async function invoke(command, args) {
    switch (command) {
      case "grid": return grid();
      case "used": return { cells: used() };
      case "get": {
        const p = parseRef(args.ref);
        if (!p) throw new Error('sheets: bad reference "' + args.ref + '"');
        return { ref: String(args.ref).toUpperCase(), value: cells.get(key(p.c, p.r)) || "" };
      }
      case "set": return setCell(args.ref, args.value);
      case "setMany": {
        const applied = (args.cells || []).map((c) => setCell(c.ref, c.value));
        return { applied: applied.length };
      }
      case "find": {
        const q = String(args.q || "").trim().toLowerCase();
        if (!q) return { hits: [] };
        const hits = used().filter((c) => c.value.toLowerCase().indexOf(q) >= 0);
        return { hits: hits.slice(0, 50) };
      }
      case "clear": cells.clear(); return { cleared: true };
      default: throw new Error('sheets: unknown command "' + command + '"');
    }
  }

  const dispose = os.registerApp({
    id: "sheets",
    name: "Sheets",
    publisher: "Magna",
    version: "0.1.0",
    pkg: "@magna/app-sheets",
    icon: "i-sheets",
    tile: "g-sheets",
    window: { w: 820, h: 560, minW: 460, minH: 320, multi: false },
    placement: { dock: true, desktop: true, order: 30 },
    aliases: ["sheet", "sheets", "spreadsheet", "grid", "excel"],
    permissions: { grant: ["sheets:read", "sheets:write"], deny: ["fs:write", "net:egress"] },
    contributes: {
      tools: ["sheets_read", "sheets_find", "sheets_set"],
      commands: ["grid", "used", "get", "find", "set", "setMany", "clear"],
      /* Commands that only read. Polling these must not enter the journal. */
      readOnly: ["grid", "used", "get", "find"],
    },
    clientRoot: resolve(HERE, "..", "client"),
    clientEntry: "app.js",
  }, invoke);

  const scope = dispose.scope;

  ctx.effect(() => ctx.tools.register(defineTool({
    name: "sheets_read",
    description:
      "Read the populated cells of the user's Sheets app. Returns only cells that have a value, " +
      "as A1 references — an empty grid returns an empty list.",
    parameters: {},
    output: {
      schema: {
        type: "object", additionalProperties: false,
        properties: {
          cells: {
            type: "array",
            items: { type: "object", additionalProperties: true,
                     properties: { ref: { type: "string" }, value: { type: "string" } } },
          },
        },
      },
      render: (_a, v) => [{
        type: "text",
        text: v.cells.length
          ? v.cells.map((c) => c.ref + "=" + c.value).join(", ")
          : "The sheet is empty.",
      }],
    },
    async execute(_a, exec) {
      const r = await invoke("used", {});
      scope.observe({ actor: "agent", verb: "read", target: "sheet", summary: "read " + r.cells.length + " cells",
                      sessionId: exec && exec.agent ? exec.agent.session.id : null });
      return r;
    },
    presentCall: () => ({ card: "generic", title: "Read the sheet", kind: "other" }),
  })), "app-sheets: tool sheets_read");

  ctx.effect(() => ctx.tools.register(defineTool({
    name: "sheets_set",
    description:
      "Write one or more cells in the user's Sheets app. References are A1 style (A1 through " +
      colName(COLS - 1) + ROWS + "). The user's window updates as you write.",
    parameters: {
      cells: {
        type: "array", required: true,
        description: "Cells to write.",
        items: {
          type: "object", additionalProperties: false,
          properties: { ref: { type: "string" }, value: { type: "string" } },
        },
      },
    },
    output: {
      schema: { type: "object", additionalProperties: false, properties: { applied: { type: "number" } } },
      render: (_a, v) => [{ type: "text", text: "Wrote " + v.applied + " cell(s)." }],
    },
    async execute(args, exec) {
      const r = await invoke("setMany", args);
      scope.observe({ actor: "agent", verb: "write", target: "sheet", summary: "wrote " + r.applied + " cells",
                      sessionId: exec && exec.agent ? exec.agent.session.id : null });
      return r;
    },
    presentCall: (a) => ({ card: "generic", title: "Write " + (a.cells || []).length + " cell(s)",
                           kind: "other", rawInput: a }),
  })), "app-sheets: tool sheets_set");

  ctx.effect(() => ctx.tools.register(defineTool({
    name: "sheets_find",
    description:
      "Find cells whose value contains a string, returning their A1 references. Use this to " +
      "locate a label or a figure before reading or overwriting it, rather than reading the " +
      "whole grid.",
    parameters: { q: { type: "string", required: true, description: "Text to look for." } },
    output: {
      schema: { type: "object", additionalProperties: false,
        properties: { hits: { type: "array", items: { type: "object", additionalProperties: true,
          properties: { ref: { type: "string" }, value: { type: "string" } } } } } },
      render: (a, v) => [{ type: "text", text: v.hits.length
        ? v.hits.map((h) => h.ref + "=" + h.value).join(", ")
        : 'No cell contains "' + a.q + '".' }],
    },
    async execute(args, exec) {
      const r = await invoke("find", args);
      scope.observe({ actor: "agent", verb: "read", target: args.q, summary: 'searched the sheet for "' + args.q + '"',
                      sessionId: exec && exec.agent ? exec.agent.session.id : null });
      return r;
    },
    presentCall: (a) => ({ card: "generic", title: 'Find "' + a.q + '" in the sheet', kind: "other", rawInput: a }),
  })), "app-sheets: tool sheets_find");

  console.log("[app-sheets] layer 3 registered - 7 commands, 3 tools");
}
