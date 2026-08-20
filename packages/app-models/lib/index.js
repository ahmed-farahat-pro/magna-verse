import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Models — layer-3 app plugin.
 * Model routes over settings.mutate, so adding a provider is UI rather than YAML.
 * @module @magna/app-models
 */
export const name = "magna-app-models";
export const inject = ["magnaOS"];

const HERE = dirname(fileURLToPath(import.meta.url));

export function apply(ctx) {
  const os = ctx.magnaOS;

  async function invoke(command, args) {
    if (command === "apps") return { apps: os.apps() };
    if (command === "activity") {
      return { actions: (os.brain && os.brain.journal ? os.brain.journal : []).slice(-300) };
    }
    throw new Error('models: unknown command "' + command + '"');
  }

  os.registerApp({
    id: "models",
    name: "Models",
    publisher: "Magna",
    version: "0.1.0",
    pkg: "@magna/app-models",
    icon: "i-models",
    tile: "g-models",
    window: { w: 880, h: 600, minW: 460, minH: 340, multi: false },
    placement: { dock: true, desktop: true, order: 65 },
    aliases: ["models","providers","llm","routes"],
    permissions: { grant: [], deny: [] },
    contributes: { tools: [], commands: ["apps", "activity"],
      /* Commands that only read. Polling these must not enter the journal. */
      readOnly: ["apps", "activity"] },
    clientRoot: resolve(HERE, "..", "client"),
    clientEntry: "app.js",
  }, invoke);

  console.log("[app-models] layer 3 registered");
}
