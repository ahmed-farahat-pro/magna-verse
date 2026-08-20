import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Terminal — layer-3 app plugin.
 * Shell access through the agent, so every command is logged and approvable.
 * @module @magna/app-terminal
 */
export const name = "magna-app-terminal";
export const inject = ["magnaOS"];

const HERE = dirname(fileURLToPath(import.meta.url));

export function apply(ctx) {
  const os = ctx.magnaOS;

  async function invoke(command, args) {
    if (command === "apps") return { apps: os.apps() };
    if (command === "activity") {
      return { actions: (os.brain && os.brain.journal ? os.brain.journal : []).slice(-300) };
    }
    throw new Error('terminal: unknown command "' + command + '"');
  }

  os.registerApp({
    id: "terminal",
    name: "Terminal",
    publisher: "Magna",
    version: "0.1.0",
    pkg: "@magna/app-terminal",
    icon: "i-term",
    tile: "g-code",
    window: { w: 880, h: 600, minW: 460, minH: 340, multi: false },
    placement: { dock: true, desktop: true, order: 50 },
    aliases: ["terminal","shell","console","bash"],
    permissions: { grant: [], deny: [] },
    contributes: { tools: [], commands: ["apps", "activity"],
      /* Commands that only read. Polling these must not enter the journal. */
      readOnly: ["apps", "activity"] },
    clientRoot: resolve(HERE, "..", "client"),
    clientEntry: "app.js",
  }, invoke);

  console.log("[app-terminal] layer 3 registered");
}
