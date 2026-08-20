import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

/**
 * The session brain.
 *
 * Two halves, deliberately kept distinguishable:
 *
 *   - The AGENT half is free. `ctx.on('session/event')` already gives the OS
 *     every tool call, message, approval and turn boundary in every session,
 *     and that listener is running in index.js.
 *   - The HUMAN half is ours. Nothing a person does in an app reaches the model
 *     unless it comes through `magnaOS.observe`.
 *
 * Two stores, and this is the part that is easy to get wrong. A session
 * projection is scoped to one conversation. Someone who works in Docs for an
 * hour with no chat open produces no session, therefore no projection, and the
 * whole hour is invisible — they open Chat, ask "what was I doing", and a brain
 * built only on projections has nothing to say. So activity is also written to
 * a workspace-scoped store that outlives every session, and the prompt is
 * assembled from both.
 *
 * One constraint decides this shape rather than a nicer one: the harness's
 * durable event vocabulary is closed (43 generated types, and the persistence
 * read path refuses anything outside it). Plugin activity therefore cannot
 * become a session event type. It rides the prompt-context channel instead,
 * which is what that channel is for.
 */

const MAX_JOURNAL = 500;

/**
 * @param ctx Cordis context — needs `systemPrompt`, optionally `dshHomePath`.
 * @param os  the MagnaOS service instance.
 * @param config plugin config.
 */
export function wireBrain(ctx, os, config) {
  const home = safeHome(ctx);
  const file = home ? join(home, "magna", "activity.json") : null;

  /** Workspace-scoped activity. Outlives every session. */
  const journal = [];
  let writeTimer = null;
  let loaded = false;

  async function load() {
    if (!file) { loaded = true; return; }
    try {
      const raw = JSON.parse(await readFile(file, "utf8"));
      if (Array.isArray(raw.actions)) journal.push(...raw.actions.slice(-MAX_JOURNAL));
    } catch { /* first run, or an unreadable file — start empty rather than fail */ }
    loaded = true;
  }

  /* Debounced: an active user generates a burst of actions and each one is not
     worth a write. Losing the last two seconds on a crash is an acceptable
     trade for not writing the file on every keystroke. */
  function persistSoon() {
    if (!file || writeTimer) return;
    writeTimer = setTimeout(async () => {
      writeTimer = null;
      try {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, JSON.stringify({ v: 1, actions: journal.slice(-MAX_JOURNAL) }), "utf8");
      } catch (e) {
        /* Surfaced rather than swallowed: a store that silently stops
           persisting produces a brain that silently forgets. */
        console.error("[magna-os] could not persist activity:", e.message);
      }
    }, 2000);
    if (writeTimer.unref) writeTimer.unref();
  }

  load();

  /* Every observed action lands in the journal. `observe` is already the single
     write path on the service, so this is the only hook needed. */
  ctx.effect(() => {
    const off = os.watch(() => {
      if (!loaded) return;
      const latest = os.recentActions[os.recentActions.length - 1];
      if (!latest) return;
      const last = journal[journal.length - 1];
      if (last && last.at === latest.at && last.target === latest.target && last.verb === latest.verb) return;
      journal.push(latest);
      if (journal.length > MAX_JOURNAL) journal.splice(0, journal.length - MAX_JOURNAL);
      persistSoon();
    });
    return () => { off(); if (writeTimer) clearTimeout(writeTimer); };
  }, "magna-os: activity journal");

  /* ---- what the model sees ----------------------------------------------
     A function, not a string: it is re-evaluated at every prompt assembly, so
     the model always reads the desktop as it is now rather than as it was when
     the session started. Empty text contributes nothing, so a quiet desktop
     costs no tokens. */
  ctx.effect(() => ctx.systemPrompt.context({
    name: "magnaverse-desktop",
    order: 150,
    text: () => renderDesktop(os, journal),
  }), "magna-os: desktop prompt context");

  return {
    journal,
    render: () => renderDesktop(os, journal),
  };
}

/** Resolve the harness home directory, if the service is mounted. */
function safeHome(ctx) {
  try {
    const v = ctx.get ? ctx.get("dshHomePath") : null;
    if (typeof v === "string") return v;
    if (v && typeof v.path === "string") return v.path;
    if (typeof v === "function") return v();
  } catch { /* not mounted in this composition */ }
  /* Same default the harness uses when DSH_HOME is unset. Returning null here
     silently disabled activity persistence on any normal launch. */
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

function ago(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.round(s / 60) + "m ago";
  if (s < 86400) return Math.round(s / 3600) + "h ago";
  return Math.round(s / 86400) + "d ago";
}

/**
 * Render the desktop for the model.
 *
 * Summarised, not streamed. Every keystroke is an action, and a brain that
 * reports all of them buries the signal and burns the context window — so the
 * journal keeps the detail and the prompt gets the shape of it.
 */
export function renderDesktop(os, journal) {
  const apps = os.apps();
  const lines = [];

  if (apps.length) {
    lines.push(
      "Installed desktop apps: " +
      apps.map((a) => a.id + " (" + a.name + ")").join(", ") +
      ". Drive them with os_invoke, or their own tools where they publish any.",
    );
  }

  /* Most recently touched app first — "what am I working on" is usually
     answered by the last thing touched, not by the longest list. */
  const byApp = new Map();
  for (const a of journal) {
    if (a.appId === "os") continue;
    /* Lifecycle events are the OS talking about itself. Without this, a
       restart makes "Docs registered" the most recent thing that happened in
       Docs, and the model reports plumbing instead of the user's actual work. */
    if (a.verb === "install" || a.verb === "delete") continue;
    const cur = byApp.get(a.appId);
    if (!cur || a.at > cur.at) byApp.set(a.appId, a);
  }
  const recent = [...byApp.values()].sort((a, b) => b.at - a.at).slice(0, 5);
  if (recent.length) {
    lines.push(
      "Recent activity in those apps: " +
      recent.map((a) => a.appId + " — " + (a.summary || a.verb) + " (" + ago(a.at) + ")").join("; ") + ".",
    );
  }

  if (!lines.length) return "";
  return "The user is working in the MagnaVERSE desktop.\n" + lines.join("\n");
}
