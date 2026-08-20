import { z } from "zod";

/**
 * Durable workflow definitions.
 *
 * The Console kept these in `localStorage` under `mv7.wf.saved`, capped at 40,
 * holding fully render-ready nodes. Three things were wrong with that: the
 * harness could not read them (so nothing could ever run one unattended), an
 * origin change wiped them, and the stored shape was the view rather than the
 * definition.
 *
 * What is stored here is the definition only — type, position, and the user's
 * parameters. Everything needed to *draw* a node (its label, icon, ports, the
 * access class the approval gate reads) is resolved at load time from the live
 * palette, which is itself generated from the tools that exist right now. A
 * workflow saved when Mail was installed and opened after Mail was removed
 * therefore shows a missing-node marker rather than a node that lies about
 * being runnable.
 *
 * @module @magna/app-workflow/store
 */

/* UNIT_NAME_RE in dsh-storage is /^[a-z][a-z0-9_]*$/ — underscores, never
   hyphens. `magna-workflow` fails at open with a name error. */
const DOMAIN = "magna_workflow";
const VERSION = 1;

const Node = z.object({
  id: z.string(),
  type: z.string(),
  x: z.number(),
  y: z.number(),
  /* Free-form: the parameter set belongs to the node type, which is generated
     from a tool schema we do not control. Validating it here would mean this
     file had to know every tool in the harness. */
  data: z.record(z.string(), z.unknown()).default({}),
});

const Edge = z.object({
  id: z.string(),
  from: z.string(),
  fromPort: z.string().default("main"),
  to: z.string(),
  toPort: z.string().default("main"),
});

/**
 * A trigger, and the capability envelope approved for it.
 *
 * `grant` is the whole reason unattended execution is defensible: it is a
 * snapshot of every node that can write, exec or egress, approved by a person
 * at save time, plus a fingerprint of the graph it was approved for. A run
 * with no human present compares the graph it is about to execute against
 * `grant.fingerprint`; anything else stops. See lib/grant.js.
 */
const Trigger = z.object({
  kind: z.enum(["manual", "webhook", "schedule"]).default("manual"),
  enabled: z.boolean().default(false),
  /* schedule */
  cron: z.string().optional(),
  tz: z.string().optional(),
  /* webhook */
  token: z.string().optional(),
  /* Loopback unless the user deliberately widens it. A workflow reachable from
     the network with filesystem nodes is a remote shell, so this defaults
     closed and the UI has to say what turning it off means. */
  loopbackOnly: z.boolean().default(true),
});

const Grant = z.object({
  /* Hash of the executable shape of the graph — node ids, types, and the
     params that decide what a node touches. Moving a node does not invalidate
     a grant; adding a `bash` node does. */
  fingerprint: z.string(),
  /* What the person actually saw and approved, kept verbatim so the UI can
     show the same list again rather than re-deriving it. */
  capabilities: z.array(z.object({
    nodeId: z.string(),
    type: z.string(),
    access: z.string(),
    egress: z.boolean().default(false),
    summary: z.string().default(""),
  })).default([]),
  at: z.number(),
  by: z.string().default("human"),
});

const Workflow = z.object({
  id: z.string(),
  name: z.string(),
  nodes: z.array(Node).default([]),
  edges: z.array(Edge).default([]),
  trigger: Trigger.nullable().default(null),
  grant: Grant.nullable().default(null),
  /* Set on anything that arrived from outside this machine. An imported
     workflow's transform nodes and exec nodes are inert until reviewed —
     importing must never be a way to run code by surprise. */
  quarantined: z.boolean().default(false),
  created: z.number(),
  modified: z.number(),
});

const Run = z.object({
  id: z.string(),
  workflowId: z.string(),
  startedAt: z.number(),
  endedAt: z.number().nullable().default(null),
  /* `running` is not terminal; every other value is. A run that ends any way
     at all — including cancellation and a rejected approval — must land on a
     terminal value, or the history grows rows that never resolve. */
  status: z.enum(["running", "ok", "failed", "cancelled", "denied"]).default("running"),
  trigger: z.string().default("manual"),
  steps: z.array(z.object({
    nodeId: z.string(),
    type: z.string(),
    status: z.string(),
    startedAt: z.number(),
    endedAt: z.number().nullable().default(null),
    summary: z.string().default(""),
    error: z.string().nullable().default(null),
  })).default([]),
  error: z.string().nullable().default(null),
});

export const SPEC = {
  name: DOMAIN,
  version: VERSION,
  tables: {
    workflows: { valueSchema: Workflow },
    runs: { valueSchema: Run },
  },
};

/** Keep run history bounded — this is a log, not an archive. */
const MAX_RUNS = 200;

/**
 * Open the domain, or fall back to memory.
 *
 * The fallback is deliberately loud. An earlier version of the brain returned
 * null when it could not find the profile and silently stopped persisting,
 * which is the worst of both worlds: it looks like it works until a restart.
 *
 * @param ctx Cordis context, which may or may not carry `storageDomain`.
 * @returns a store with the same surface either way.
 */
export async function openStore(ctx) {
  let domain = null;
  try {
    if (ctx.storageDomain) domain = await ctx.storageDomain.open(SPEC);
  } catch (e) {
    console.error(
      "[app-workflow] could not open durable storage (" + e.message + "). " +
      "Workflows will live in memory only and will NOT survive a restart.",
    );
  }
  if (!domain) {
    console.warn("[app-workflow] storageDomain unavailable — workflows are in-memory for this run.");
    return memoryStore();
  }

  const workflows = domain.table("workflows");
  const runs = domain.table("runs");

  return {
    durable: true,
    close: () => domain.close(),

    list() {
      return [...workflows.entries()]
        .map(([, w]) => w)
        .sort((a, b) => b.modified - a.modified);
    },
    get: (id) => workflows.get(id),
    async put(wf) {
      await workflows.put(wf.id, wf);
      return wf;
    },
    delete: (id) => workflows.delete(id),

    runsFor(workflowId, limit) {
      return [...runs.entries()]
        .map(([, r]) => r)
        .filter((r) => !workflowId || r.workflowId === workflowId)
        .sort((a, b) => b.startedAt - a.startedAt)
        .slice(0, limit || 25);
    },
    getRun: (id) => runs.get(id),
    async putRun(run) {
      await runs.put(run.id, run);
      /* Trim oldest beyond the cap. Runs are written far more often than
         workflows, and an unbounded table is rewritten whole on every write
         by the JSON backend. */
      if (runs.size > MAX_RUNS) {
        const stale = [...runs.entries()]
          .map(([k, r]) => ({ k, at: r.startedAt }))
          .sort((a, b) => a.at - b.at)
          .slice(0, runs.size - MAX_RUNS);
        for (const s of stale) await runs.delete(s.k);
      }
      return run;
    },
  };
}

/** Same surface, no durability. Used only when the domain could not open. */
function memoryStore() {
  const wf = new Map();
  const rs = new Map();
  return {
    durable: false,
    close: async () => {},
    list: () => [...wf.values()].sort((a, b) => b.modified - a.modified),
    get: (id) => wf.get(id),
    put: async (w) => (wf.set(w.id, w), w),
    delete: async (id) => wf.delete(id),
    runsFor: (id, limit) => [...rs.values()]
      .filter((r) => !id || r.workflowId === id)
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit || 25),
    getRun: (id) => rs.get(id),
    putRun: async (r) => (rs.set(r.id, r), r),
  };
}

/** Validate and normalise anything arriving from the browser or an import. */
export function parseWorkflow(input) {
  return Workflow.parse(input);
}

export { Workflow, Run, Trigger, Grant };
