import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Ledger — layer-3 app plugin.
 * The session log rendered as an audit trail - who did what, when, and why.
 * @module @magna/app-ledger
 */
export const name = "magna-app-ledger";
export const inject = ["magnaOS"];

const HERE = dirname(fileURLToPath(import.meta.url));

export function apply(ctx) {
  const os = ctx.magnaOS;

  async function invoke(command, args) {
    if (command === "apps") return { apps: os.apps() };
    if (command === "activity") {
      return { actions: (os.brain && os.brain.journal ? os.brain.journal : []).slice(-300) };
    }
    throw new Error('ledger: unknown command "' + command + '"');
  }

  os.registerApp({
    id: "ledger",
    name: "Ledger",
    publisher: "Magna",
    version: "0.1.0",
    pkg: "@magna/app-ledger",
    icon: "i-ledger",
    tile: "g-ledger",
    window: { w: 880, h: 600, minW: 460, minH: 340, multi: false },
    placement: { dock: true, desktop: true, order: 60 },
    aliases: ["ledger","audit","trail","history"],
    permissions: { grant: [], deny: [] },
    contributes: { tools: [], commands: ["apps", "activity"],
      /* Commands that only read. Polling these must not enter the journal. */
      readOnly: ["apps", "activity"] },
    clientRoot: resolve(HERE, "..", "client"),
    clientEntry: "app.js",
  }, invoke);

  console.log("[app-ledger] layer 3 registered");
}
