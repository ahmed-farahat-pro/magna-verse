import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Trajectory — a read-only view of what the agent actually did.
 *
 * This is the counterweight to agentic retrieval. Giving the model search tools
 * and letting it decide what to fetch is only better than one-shot RAG if you
 * can SEE the decisions it made — which query it ran, what came back, what it
 * did next. Otherwise you have swapped an opaque similarity score for an opaque
 * sequence of tool calls.
 *
 * @module @magna/app-trajectory
 */
export const name = "magna-app-trajectory";
export const inject = ["magnaOS"];

const HERE = dirname(fileURLToPath(import.meta.url));

export function apply(ctx) {
  const os = ctx.magnaOS;

  async function invoke(command) {
    if (command === "ping") return { ok: true };
    throw new Error('trajectory: unknown command "' + command + '"');
  }

  os.registerApp({
    id: "trajectory",
    name: "Trajectory",
    publisher: "Magna",
    version: "0.1.0",
    pkg: "@magna/app-trajectory",
    icon: "i-agent",
    tile: "g-brain",
    window: { w: 900, h: 620, minW: 480, minH: 340, multi: false },
    placement: { dock: true, desktop: true, order: 25 },
    aliases: ["trajectory", "trace", "steps", "what did it do", "audit"],
    permissions: { grant: ["sessions:read"], deny: ["sessions:write", "net:egress"] },
    contributes: { tools: [], commands: ["ping"],
      /* Commands that only read. Polling these must not enter the journal. */
      readOnly: ["ping"] },
    clientRoot: resolve(HERE, "..", "client"),
    clientEntry: "app.js",
  }, invoke);

  console.log("[app-trajectory] layer 3 registered - read-only session trace");
}
