import { defineTool } from "@deepseek-ai/dsh-tools";

/**
 * The `os_*` tools — the agent's hands on the desktop.
 *
 * These are the layer 2 to layer 1 direction: the OS contributing capability
 * downward, so the model can open a window or drive an app the same way a
 * person can. Both paths end at `magnaOS.invoke`, which is what keeps them
 * equally observable — an action the agent took and an action the user took
 * look the same to the brain, because they are the same call.
 *
 * Names are prefixed because the harness tool registry is one flat global
 * namespace and duplicate registration throws. `open` would collide with the
 * first marketplace app that wants it; `os_open_app` cannot.
 */

/**
 * @param ctx Cordis context carrying `tools`.
 * @param os  the MagnaOS service instance.
 */
export function registerOsTools(ctx, os) {
  ctx.effect(() => ctx.tools.register(defineTool({
    name: "os_list_apps",
    description:
      "List the apps installed in the MagnaVERSE desktop. Use this before opening or driving " +
      "an app so you know what is actually available to this user — the set changes as plugins " +
      "are installed and removed.",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          apps: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                publisher: { type: "string" },
                commands: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: "text",
        text: value.apps.length
          ? "Installed apps: " + value.apps.map((a) => a.id).join(", ")
          : "No apps are installed in the desktop yet.",
      }],
    },
    execute() {
      return Promise.resolve({
        apps: os.apps().map((a) => ({
          id: a.id,
          name: a.name,
          publisher: a.publisher,
          commands: a.contributes.commands || [],
        })),
      });
    },
    presentCall: () => ({ card: "generic", title: "List desktop apps", kind: "other" }),
  })), "magna-os: tool os_list_apps");

  ctx.effect(() => ctx.tools.register(defineTool({
    name: "os_open_app",
    description:
      "Open an app window on the MagnaVERSE desktop. The window appears for the user " +
      "immediately. Call os_list_apps first if you are not certain the app id exists.",
    parameters: {
      appId: { type: "string", required: true, description: "The app id, as returned by os_list_apps." },
      params: {
        type: "object",
        /* Optional parameters omit `required` entirely. `required: false` is
           rejected at plugin load with "must be true when present". */
        additionalProperties: true,
        description: "Optional launch parameters passed to the app, for example a document id.",
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { opened: { type: "boolean" }, appId: { type: "string" } },
      },
      render: (args, value) => [{
        type: "text",
        text: value.opened ? "Opened " + args.appId + "." : "Could not open " + args.appId + ".",
      }],
    },
    async execute(args, exec) {
      const found = os.apps().some((a) => a.id === args.appId);
      if (!found) {
        throw new Error(
          'os_open_app: "' + args.appId + '" is not installed. Installed: ' +
          (os.apps().map((a) => a.id).join(", ") || "none"),
        );
      }
      os.observe({
        appId: args.appId,
        verb: "open",
        target: args.appId,
        summary: "opened by the agent",
        sessionId: exec && exec.agent ? exec.agent.session.id : null,
      });
      return { opened: true, appId: args.appId };
    },
    presentCall: (args) => ({ card: "generic", title: "Open " + args.appId, kind: "other", rawInput: args }),
  })), "magna-os: tool os_open_app");

  ctx.effect(() => ctx.tools.register(defineTool({
    name: "os_invoke",
    description:
      "Run a command inside an installed desktop app — for example creating a document or " +
      "reading the current selection. This is the same call path a user's click takes, so the " +
      "result and the app's resulting state are identical either way.",
    parameters: {
      appId: { type: "string", required: true, description: "The app id." },
      command: { type: "string", required: true, description: "The command name the app exposes." },
      args: {
        type: "object",
        additionalProperties: true,
        description: "Command arguments. Shape depends on the app and command.",
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        /* `json` is the validator's catch-all for a value whose shape is
           decided by the app, not by this tool. An untyped {} is rejected. */
        properties: { ok: { type: "boolean" }, result: { type: "json" } },
      },
      render: (args, value) => [{
        type: "text",
        text: value.ok
          ? args.appId + "." + args.command + " completed: " + JSON.stringify(value.result).slice(0, 400)
          : args.appId + "." + args.command + " failed.",
      }],
    },
    async execute(args, exec) {
      const result = await os.invoke(args.appId, args.command, args.args || {}, {
        actor: "agent",
      });
      /* invoke() records this itself, with actor:agent passed above. Recording
         again here produced two journal entries per agent invoke. */
      return { ok: true, result: result === undefined ? null : result };
    },
    presentCall: (args) => ({
      card: "generic", title: args.appId + " · " + args.command, kind: "other", rawInput: args,
    }),
  })), "magna-os: tool os_invoke");
}
