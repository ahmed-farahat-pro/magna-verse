import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Approvals — layer-3 app plugin.
 * Reads approval/asked and approval/decided straight from the session log.
 * @module @magna/app-approvals
 */
export const name = "magna-app-approvals";
export const inject = ["magnaOS"];

const HERE = dirname(fileURLToPath(import.meta.url));

export function apply(ctx) {
  const os = ctx.magnaOS;

  async function invoke(command, args) {
    if (command === "apps") return { apps: os.apps() };
    if (command === "activity") {
      return { actions: (os.brain && os.brain.journal ? os.brain.journal : []).slice(-300) };
    }
    throw new Error('approvals: unknown command "' + command + '"');
  }

  os.registerApp({
    id: "approvals",
    name: "Approvals",
    publisher: "Magna",
    version: "0.1.0",
    pkg: "@magna/app-approvals",
    icon: "i-shield",
    tile: "g-mcp",
    window: { w: 880, h: 600, minW: 460, minH: 340, multi: false },
    placement: { dock: true, desktop: true, order: 55 },
    aliases: ["approvals","permissions","consent"],
    permissions: { grant: [], deny: [] },
    contributes: { tools: [], commands: ["apps", "activity"],
      /* Commands that only read. Polling these must not enter the journal. */
      readOnly: ["apps", "activity"] },
    clientRoot: resolve(HERE, "..", "client"),
    clientEntry: "app.js",
  }, invoke);

  console.log("[app-approvals] layer 3 registered");
}
