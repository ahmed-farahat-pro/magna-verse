import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Marketplace — the app that installs other apps.
 *
 * It owns no catalogue of its own: `os.market` does, because installing is a
 * privileged operation that shells out to the harness's plugin command, and
 * that must stay on layer 2 where it can be gated. This app is a view over it.
 *
 * @module @magna/app-market
 */
export const name = "magna-app-market";
export const inject = ["magnaOS"];

const HERE = dirname(fileURLToPath(import.meta.url));

export function apply(ctx) {
  const os = ctx.magnaOS;

  async function invoke(command, args) {
    switch (command) {
      case "list":
        return { items: await os.market.list() };
      case "install":
        return os.market.mutate("add", args.target);
      case "remove":
        return os.market.mutate("remove", args.target);
      case "skills":
        return os.harness.skills(args.sessionId);
      case "agents":
        return os.harness.subagents(args.sessionId);
      case "models":
        return os.harness.models();
      case "automations":
        return os.harness.schedule();
      default:
        throw new Error('market: unknown command "' + command + '"');
    }
  }

  os.registerApp({
    id: "market",
    name: "Marketplace",
    publisher: "Magna",
    version: "0.1.0",
    pkg: "@magna/app-market",
    icon: "i-market",
    tile: "g-market",
    window: { w: 760, h: 560, minW: 420, minH: 320, multi: false },
    placement: { dock: true, desktop: true, order: 40 },
    aliases: ["market", "marketplace", "apps", "install", "store"],
    permissions: { grant: ["plugins:install", "plugins:remove"], deny: ["net:egress"] },
    contributes: { tools: [], commands: ["list", "install", "remove", "skills", "agents", "models", "automations"],
      /* Commands that only read. Polling these must not enter the journal. */
      readOnly: ["list", "skills", "agents", "models", "automations"] },
    clientRoot: resolve(HERE, "..", "client"),
    clientEntry: "app.js",
  }, invoke);

  console.log("[app-market] layer 3 registered - install and removal are real");
}
