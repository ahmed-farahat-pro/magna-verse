import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

/**
 * The marketplace — real install and removal.
 *
 * This runs `dsh plugin --profile <p> add|remove`, which is the harness's own
 * supported path and the same one used from a terminal. Nothing is bespoke:
 * the package is linked, `dsh.bundle.patch` puts it in the profile's bundle
 * list, and the Cordis loader mounts it on next boot.
 *
 * Two things this deliberately does NOT do:
 *
 *   - It does not install from the open internet. The catalogue is the local
 *     `packages/` directory. A marketplace that can pull arbitrary npm packages
 *     into a sovereign deployment is a supply-chain hole with a nice icon on
 *     it, and opening that door is a decision for whoever owns the deployment,
 *     not a default.
 *   - It does not restart the harness. Adding a profile row changes what the
 *     NEXT boot composes; the running process keeps its current tree. Claiming
 *     a live install would be a lie the user discovers at the worst moment, so
 *     the result says plainly that a restart is needed.
 */

/* A package NAME, for removal. Anything with a shell metacharacter fails here
   rather than reaching execFile. */
const NAME_OK = /^[@a-z0-9][\w.@/-]{0,120}$/i;

/**
 * Accept a target only if it is a plain package name, or a directory that
 * resolves INSIDE this workspace's packages/ folder. A regex on the string
 * would let "../../etc" through while looking strict; containment is the
 * property actually wanted, so check that instead.
 */
function validateTarget(target, repoRoot) {
  if (typeof target !== "string" || target.length === 0 || target.length > 400) {
    throw new Error("market: refusing an empty or oversized package spec");
  }
  if (/[;&|`$\n\r<>(){}*?!\\]/.test(target)) {
    throw new Error("market: refusing a package spec containing shell metacharacters");
  }
  if (target.startsWith("/") || target.startsWith(".")) {
    if (!repoRoot) throw new Error("market: no workspace root configured, so a path cannot be validated");
    const base = resolve(repoRoot, "packages");
    const abs = resolve(repoRoot, target);
    if (abs !== base && !abs.startsWith(base + sep)) {
      throw new Error("market: refusing a path outside this workspace's packages directory");
    }
    return abs;
  }
  if (!NAME_OK.test(target)) throw new Error("market: refusing a package spec that is not a plain name");
  return target;
}

/**
 * Scan the workspace for installable app packages.
 * @param repoRoot absolute path to the repo holding `packages/`
 * @param installedIds ids already registered with the OS
 */
export async function catalogue(repoRoot, running, profileDir) {
  /* `running` may be a plain id list or the live manifests. Accepting both
     keeps older callers working while letting the shelf rank by capability. */
  const runningIds = running.map((r) => (typeof r === "string" ? r : r.id));
  const toolCounts = new Map(
    running.filter((r) => typeof r !== "string")
           .map((r) => [r.id, ((r.contributes || {}).tools || []).length]),
  );
  if (!repoRoot) return [];

  /* Three states, not two, and conflating them is what makes the marketplace
     feel broken:
       running        — in the profile AND mounted in this process
       needs-restart  — in the profile, not yet mounted (a fresh install)
       available      — not in the profile at all
     Reading "installed" from the running registry alone means a just-installed
     app still shows an Install button, so the user clicks it again and nothing
     appears to happen. */
  let inProfile = new Set();
  if (profileDir) {
    try {
      const pj = JSON.parse(await readFile(join(profileDir, "package.json"), "utf8"));
      inProfile = new Set(Object.keys(pj.dependencies || {}));
    } catch { /* first run, or an unreadable profile */ }
  }
  const out = [];
  let dirs = [];
  try {
    dirs = await readdir(join(repoRoot, "packages"), { withFileTypes: true });
  } catch {
    return [];
  }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const dir = join(repoRoot, "packages", d.name);
    let pkg;
    try {
      pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    } catch { continue; }
    /* An app is identified by the OS's own marker, not by dsh.bundle. Apps are
       mounted by the OS rather than by the harness loader, so they deliberately
       carry no bundle declaration — filtering on one made every app invisible
       to its own marketplace. */
    if (!pkg.magna || !pkg.magna.appId) continue;
    if (pkg.name === "@magna/os") continue;             /* the OS is not an app */

    const magna = pkg.magna || {};
    out.push({
      pkg: pkg.name,
      dir,
      appId: magna.appId || d.name.replace(/^app-/, ""),
      name: magna.title || pkg.name,
      publisher: magna.publisher || "Magna",
      version: pkg.version || "0.0.0",
      description: pkg.description || "",
      permissions: magna.permissions || { grant: [], deny: [] },
      /* Shelf metadata lives in the package, not the client. A category the UI
         hardcodes is a category that goes wrong the moment someone ships a
         plugin the UI has never heard of. */
      category: magna.category || "Other",
      toolCount: toolCounts.get(magna.appId || d.name.replace(/^app-/, "")) || 0,
      tagline: magna.tagline || pkg.description || "",
      glyph: magna.glyph || "▢",
      inProfile: inProfile.has(pkg.name),
      running: runningIds.indexOf(magna.appId || d.name.replace(/^app-/, "")) >= 0,
      /* Kept for callers that only care whether it is present at all. */
      installed: inProfile.has(pkg.name),
      state: inProfile.has(pkg.name)
        ? (runningIds.indexOf(magna.appId || d.name.replace(/^app-/, "")) >= 0 ? "running" : "needs-restart")
        : "available",
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function run(bin, args, cwd) {
  return new Promise((resolve) => {
    execFile(bin, args, { cwd, timeout: 120000, maxBuffer: 4 << 20 }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        code: err ? (err.code ?? 1) : 0,
        stdout: String(stdout || "").slice(-4000),
        stderr: String(stderr || err?.message || "").slice(-4000),
      });
    });
  });
}

/**
 * Install or remove one plugin package.
 * @param opts {{repoRoot, profile, dshBin, action:'add'|'remove', target}}
 */
export async function mutatePlugin(opts) {
  const { repoRoot, profile, dshBin, action, target, installedPackages } = opts;
  if (action !== "add" && action !== "remove") throw new Error("market: action must be add or remove");
  const safeTarget = validateTarget(target, repoRoot);
  if (!dshBin) throw new Error("market: the dsh binary was not found; set config.dshBin");

  /* The caller resolves the package name for us, because it holds the
     catalogue and we do not. Without it this guard compared a DIRECTORY
     against a list of PACKAGE NAMES — it never matched, every removal
     short-circuited to `noop`, and the UI reported success while the plugin
     kept running. Falling back to `safeTarget` keeps a direct package-name
     call working. */
  const pkgName = opts.pkgName || safeTarget;

  /* pnpm exits non-zero when asked to remove something it never installed, and
     the raw failure ("pnpm failed in profile directory ...") tells the user
     nothing about what actually happened. Answer the real question instead. */
  if (action === "remove" && Array.isArray(installedPackages) && installedPackages.indexOf(pkgName) < 0) {
    return {
      ok: true, action, target: safeTarget, restartRequired: false, noop: true,
      message: safeTarget + " is not installed in this profile.",
      output: "",
    };
  }

  /* The two actions want DIFFERENT forms of the same thing, and pnpm is strict
     about it:
       add    — needs the directory, because that is what it links to;
       remove — needs the package NAME. Handed a path it fails outright with
                ERR_PNPM_CANNOT_REMOVE_MISSING_DEPS, and then helpfully prints
                the very list of names it wanted.
     The browser only knows directories, so the translation happens here rather
     than asking every caller to know which action takes which. */
  const spec = action === "remove" ? validateTarget(pkgName, repoRoot) : safeTarget;
  const args = ["plugin", "--profile", profile, action, spec];
  const r = await run(dshBin, args, repoRoot || process.cwd());
  return {
    ok: r.ok,
    action,
    target: safeTarget,
    /* Said plainly rather than implied: the profile changed, the running
       process did not. */
    restartRequired: r.ok,
    message: r.ok
      ? (action === "add" ? "Installed. Restart the harness to load it." : "Removed. Restart the harness to unload it.")
      : (r.stderr || r.stdout || "the plugin command failed"),
    output: (r.stdout + "\n" + r.stderr).trim().slice(-1200),
  };
}
