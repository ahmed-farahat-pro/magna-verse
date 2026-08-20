import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Brain — the session brain, drawn.
 *
 * Every node is a thing the harness actually recorded and every edge is a fact
 * from the session log: this session called that tool, that call named this
 * document. Nothing is inferred by similarity.
 *
 * That distinction is the whole reason this is not a vector graph. A similarity
 * edge says two things are probably related; a provenance edge says the agent
 * read this document in that session at that time. For an auditable system the
 * second is worth more, and it costs no embedding model to produce.
 *
 * @module @magna/app-brain
 */
export const name = "magna-app-brain";
export const inject = ["magnaOS"];

const HERE = dirname(fileURLToPath(import.meta.url));

export function apply(ctx) {
  const os = ctx.magnaOS;

  async function invoke(command) {
    /* The human half of the brain — actions taken in apps with no session
       open. The client joins these onto the graph so work done outside a
       conversation is still visible. */
    if (command === "activity") {
      return { actions: (os.brain && os.brain.journal ? os.brain.journal : []).slice(-200) };
    }
    if (command === "apps") return { apps: os.apps() };
    throw new Error('brain: unknown command "' + command + '"');
  }

  os.registerApp({
    id: "brain",
    name: "Brain",
    publisher: "Magna",
    version: "0.1.0",
    pkg: "@magna/app-brain",
    icon: "i-brain",
    tile: "g-brain",
    window: { w: 940, h: 640, minW: 520, minH: 380, multi: false },
    placement: { dock: true, desktop: true, order: 15 },
    aliases: ["brain", "graph", "memory", "knowledge", "provenance"],
    permissions: { grant: ["sessions:read", "apps:read"], deny: ["sessions:write", "net:egress"] },
    contributes: { tools: [], commands: ["activity", "apps"],
      /* Commands that only read. Polling these must not enter the journal. */
      readOnly: ["activity", "apps"] },
    clientRoot: resolve(HERE, "..", "client"),
    clientEntry: "app.js",
  }, invoke);

  console.log("[app-brain] layer 3 registered - provenance graph over the session log");
}
