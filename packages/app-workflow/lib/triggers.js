import { randomBytes } from "node:crypto";

/**
 * Triggers: manual, webhook and schedule.
 *
 * You asked for all three, and for nodes that reach bash and the filesystem.
 * Individually both are fine. Together they create the one problem this file
 * exists to solve:
 *
 *   A scheduled workflow with shell access runs at 06:00 with nobody there to
 *   approve it. The approval bar is the safety net, and an unattended run has
 *   nobody to answer it.
 *
 * The answer is not to weaken the gate — a gate that waives itself when nobody
 * is looking is not a gate. It is to move the decision to a moment when you ARE
 * present: you approve a capability envelope once, at save time, and the
 * trigger runs inside it. Anything outside fails closed and lands in the run
 * history for you to look at.
 *
 * The envelope is pinned to a fingerprint of the graph's executable shape, so
 * "approve a harmless workflow, then add a bash node" does not work: editing
 * the graph invalidates the grant and disables the trigger (see `save` in
 * index.js).
 *
 * @module @magna/app-workflow/triggers
 */

/* ---- cron -----------------------------------------------------------------
   A deliberately small five-field parser: minute, hour, day-of-month, month,
   day-of-week, with `*`, lists, ranges and steps. No `@reboot`, no seconds, no
   names. Supporting less than cron does is safer than supporting a dialect of
   it: a user who writes something this cannot parse gets an error when they
   save it, rather than a job that silently never fires — or worse, fires at the
   wrong time because we guessed. */

const FIELDS = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day of month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12 },
  { name: "day of week", min: 0, max: 6 },
];

/** Parse one field into the set of values it matches. Throws on anything odd. */
function parseField(spec, f) {
  const out = new Set();
  for (const part of String(spec).split(",")) {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) {
      throw new Error('cron: "' + part + '" has a bad step in the ' + f.name + " field");
    }
    let lo, hi;
    if (rangePart === "*") { lo = f.min; hi = f.max; }
    else if (rangePart.indexOf("-") > 0) {
      const [a, b] = rangePart.split("-").map(Number);
      lo = a; hi = b;
    } else {
      lo = hi = Number(rangePart);
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < f.min || hi > f.max || lo > hi) {
      throw new Error('cron: "' + part + '" is out of range for the ' + f.name + " field (" + f.min + "-" + f.max + ")");
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

export function parseCron(expr) {
  const parts = String(expr || "").trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error("cron: expected five fields (minute hour day-of-month month day-of-week), got " + parts.length);
  }
  return FIELDS.map((f, i) => parseField(parts[i], f));
}

/**
 * Does this expression match this moment, in this timezone?
 *
 * The timezone is honoured through Intl rather than by offsetting a UTC
 * timestamp, because the offset is not constant — a workflow set for 06:00
 * local must still fire at 06:00 local after a DST change, and arithmetic on a
 * fixed offset silently drifts by an hour twice a year.
 */
export function cronMatches(sets, when, tz) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz || "UTC",
    hour12: false,
    minute: "2-digit", hour: "2-digit", day: "2-digit", month: "2-digit", weekday: "short",
  }).formatToParts(when);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const minute = Number(get("minute"));
  /* Intl renders midnight as "24" in some locales' hour12:false output. */
  const hour = Number(get("hour")) % 24;
  const dom = Number(get("day"));
  const month = Number(get("month"));
  const dow = dowMap[get("weekday")];

  const [mins, hours, doms, months, dows] = sets;
  if (!mins.has(minute) || !hours.has(hour) || !months.has(month)) return false;
  /* Standard cron quirk, reproduced deliberately: when BOTH day-of-month and
     day-of-week are restricted, a match on either is enough. */
  const domRestricted = doms.size !== 31;
  const dowRestricted = dows.size !== 7;
  if (domRestricted && dowRestricted) return doms.has(dom) || dows.has(dow);
  if (domRestricted) return doms.has(dom);
  if (dowRestricted) return dows.has(dow);
  return true;
}

/** A URL-safe secret for a webhook. 32 bytes — guessing is not a threat model. */
export function newToken() {
  return randomBytes(24).toString("base64url");
}

/**
 * The scheduler.
 *
 * One timer for every workflow rather than one per schedule, aligned to the
 * top of each minute. Cron's resolution is a minute, so a tick per minute is
 * exactly enough, and firing on the minute boundary means "0 6 * * *" runs at
 * 06:00:0x rather than at whatever second the harness happened to start.
 */
export function startScheduler(opts) {
  const { list, fire, log } = opts;
  let timer = null;
  let stopped = false;
  /* Guards against a double fire when a tick lands twice inside one minute,
     which a timer correction can cause. */
  const lastFired = new Map();

  function tick() {
    if (stopped) return;
    const now = new Date();
    const stamp = now.toISOString().slice(0, 16);      /* minute resolution */
    for (const wf of list()) {
      const t = wf.trigger;
      if (!t || t.kind !== "schedule" || !t.enabled) continue;
      if (!wf.grant) continue;                          /* no envelope, no unattended run */
      if (wf.quarantined) continue;
      if (lastFired.get(wf.id) === stamp) continue;
      let sets;
      try { sets = parseCron(t.cron); }
      catch (e) { log("schedule for \"" + wf.name + "\" is not valid: " + e.message); continue; }
      if (!cronMatches(sets, now, t.tz)) continue;
      lastFired.set(wf.id, stamp);
      Promise.resolve(fire(wf, "schedule", { firedAt: now.toISOString() }))
        .catch((e) => log("scheduled run of \"" + wf.name + "\" failed to start: " + e.message));
    }
    schedule();
  }

  function schedule() {
    if (stopped) return;
    const ms = 60000 - (Date.now() % 60000) + 250;      /* just past the minute */
    timer = setTimeout(tick, ms);
  }

  schedule();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

/**
 * Is this request allowed to fire this webhook?
 *
 * Loopback is the default because a webhook on a workflow with shell nodes is
 * an execution endpoint, and the token would be the only thing between a
 * stranger and the filesystem. Turning it off is a real decision, and the UI
 * says so rather than presenting it as a checkbox like any other.
 */
export function webhookAllowed(trigger, remoteAddress) {
  if (!trigger || trigger.kind !== "webhook" || !trigger.enabled) {
    return { ok: false, code: 404, reason: "No webhook is enabled for this workflow." };
  }
  if (trigger.loopbackOnly !== false && !isLoopback(remoteAddress)) {
    return { ok: false, code: 403, reason: "This webhook only accepts requests from this machine." };
  }
  return { ok: true };
}

export function isLoopback(addr) {
  if (!addr) return false;
  const a = String(addr).replace(/^::ffff:/, "");
  return a === "127.0.0.1" || a === "::1" || a === "localhost" || /^127\./.test(a);
}
