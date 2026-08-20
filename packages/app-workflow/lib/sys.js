import { spawn } from "node:child_process";
import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";

/**
 * Shell, filesystem and HTTP nodes — implemented here, not borrowed.
 *
 * The intent was to generate every node from the harness's own tool registry,
 * so that a node could only exist if something could already execute it. That
 * works for app tools and for anything registered globally. It does not work
 * for the harness's own `bash`, `read`, `write`, `glob`, `grep` and
 * `web_fetch`, and the reason is the same one that ruled out `workflowEngine`:
 * in the web profile those rows are `disabled: true` at the host plane and live
 * inside an agent preset's realm. `ctx.tools.schemas()` from this plugin's
 * context returns 14 tools, none of them shell or filesystem. They are not
 * hidden from us by policy — they are in a realm we are not in.
 *
 * So the choice was to offer no shell nodes at all, or to implement them. This
 * file implements them, and doing so is arguably the better outcome for the
 * part that matters: the approval gate is now ours, in-process, on the same
 * side of the boundary as the thing it guards. There is no path from a workflow
 * node to a shell that does not go through `guard()` in run.js.
 *
 * Descriptor and implementation live in the same object on purpose. A palette
 * entry with nothing behind it is precisely the dummy data this project is
 * removing, and keeping them in one place makes that state unrepresentable.
 *
 * @module @magna/app-workflow/sys
 */

const MAIN_IN = [{ id: "main", label: "in" }];
const MAIN_OUT = [{ id: "main", label: "out" }];

/** Hard ceiling on captured output, so one runaway command cannot exhaust memory. */
const MAX_OUT = 256 * 1024;

/** Read a param, interpolated by the executor before it reaches here. */
const S = (v, d) => (v === undefined || v === null || v === "" ? d : String(v));
const N = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export const SYS = {
  "sys.bash": {
    g: "System", name: "Run a command", icon: "i-term", tile: "g-term",
    ins: MAIN_IN, outs: MAIN_OUT,
    access: "exec", egress: true,
    why: "runs a shell command with your full permissions — the same power as opening Terminal",
    desc: "Runs a command through the shell and returns its output, exit code and duration.",
    params: [
      { k: "command", l: "Command", t: "area", d: "", req: true, hint: "Supports {{expr}} from upstream nodes" },
      { k: "cwd", l: "Working directory", t: "text", d: "", hint: "Defaults to your home directory" },
      { k: "timeout", l: "Timeout (seconds)", t: "num", d: 60 },
    ],
    async run(p) {
      const command = S(p.command, "").trim();
      if (!command) throw new Error("sys.bash: no command");
      const cwd = S(p.cwd, process.env.HOME || process.cwd());
      const timeout = Math.max(1, Math.min(3600, N(p.timeout, 60))) * 1000;
      return execShell(command, cwd, timeout);
    },
  },

  "sys.read": {
    g: "System", name: "Read a file", icon: "i-doc", tile: "g-docs",
    ins: MAIN_IN, outs: MAIN_OUT,
    access: "read", egress: false,
    why: "reads a file from this machine's disk",
    desc: "Reads a UTF-8 file and returns its contents.",
    params: [
      { k: "path", l: "Path", t: "text", d: "", req: true },
      { k: "maxBytes", l: "Max bytes", t: "num", d: 262144 },
    ],
    async run(p) {
      const path = resolve(S(p.path, ""));
      if (!S(p.path, "")) throw new Error("sys.read: no path");
      const max = Math.max(1, N(p.maxBytes, MAX_OUT));
      const body = await readFile(path, "utf8");
      return {
        path,
        bytes: Buffer.byteLength(body),
        truncated: body.length > max,
        content: body.length > max ? body.slice(0, max) : body,
      };
    },
  },

  "sys.write": {
    g: "System", name: "Write a file on disk", icon: "i-file", tile: "g-docs",
    ins: MAIN_IN, outs: MAIN_OUT,
    access: "write", egress: false,
    why: "creates or overwrites a file on this machine's disk",
    desc: "Writes text to a raw filesystem path. To save into the desktop's documents instead, " +
          "use Docs · save — it offers a picker and can create a new one.",
    params: [
      { k: "path", l: "Path", t: "text", d: "", req: true,
        hint: "An absolute filesystem path, e.g. ~/Desktop/notes.txt" },
      /* Defaults to the incoming value. Blank by default meant a node wired
         to a model wrote an empty file and reported success — the user had to
         know to type {{main}} to get the thing they had just connected. */
      { k: "content", l: "Content", t: "area", d: "{{main}}",
        hint: "{{main}} is whatever the previous node produced. Edit freely." },
      { k: "mode", l: "If it exists", t: "sel", o: ["overwrite", "append", "fail"], d: "fail" },
    ],
    async run(p) {
      const raw = S(p.path, "");
      if (!raw) throw new Error("sys.write: no path");
      const path = resolve(raw);
      const content = p.content == null ? "" : String(p.content);
      const mode = S(p.mode, "fail");
      let exists = false;
      try { await stat(path); exists = true; } catch { exists = false; }
      /* `fail` is the default deliberately. A workflow that silently replaced a
         file the first time someone ran it would be the kind of surprise this
         whole approval design exists to prevent. */
      if (exists && mode === "fail") {
        throw new Error("sys.write: " + path + " already exists (set 'If it exists' to overwrite or append)");
      }
      await mkdir(dirname(path), { recursive: true });
      if (exists && mode === "append") {
        const prev = await readFile(path, "utf8");
        await writeFile(path, prev + content, "utf8");
      } else {
        await writeFile(path, content, "utf8");
      }
      return { path, bytes: Buffer.byteLength(content), mode, existed: exists };
    },
  },

  "sys.list": {
    g: "System", name: "List a directory", icon: "i-folder", tile: "g-docs",
    ins: MAIN_IN, outs: MAIN_OUT,
    access: "read", egress: false,
    why: "lists the contents of a directory on this machine",
    desc: "Lists directory entries with their type and size.",
    params: [
      { k: "path", l: "Path", t: "text", d: "", req: true },
      { k: "limit", l: "Max entries", t: "num", d: 200 },
    ],
    async run(p) {
      const raw = S(p.path, "");
      if (!raw) throw new Error("sys.list: no path");
      const path = resolve(raw);
      const limit = Math.max(1, Math.min(5000, N(p.limit, 200)));
      const names = await readdir(path, { withFileTypes: true });
      const items = [];
      for (const d of names.slice(0, limit)) {
        let size = null;
        try { size = d.isFile() ? (await stat(resolve(path, d.name))).size : null; } catch { /* raced or unreadable */ }
        items.push({ name: d.name, dir: d.isDirectory(), size });
      }
      return { path, count: names.length, truncated: names.length > limit, items };
    },
  },

  "sys.http": {
    g: "System", name: "HTTP request", icon: "i-globe", tile: "g-conn",
    ins: MAIN_IN, outs: MAIN_OUT,
    access: "read", egress: true,
    why: "sends a request over the network — this leaves the machine",
    desc: "Makes an HTTP request and returns the status, headers and body.",
    params: [
      { k: "url", l: "URL", t: "text", d: "", req: true },
      { k: "method", l: "Method", t: "sel", o: ["GET", "POST", "PUT", "PATCH", "DELETE"], d: "GET" },
      { k: "headers", l: "Headers", t: "json", d: "{}" },
      { k: "body", l: "Body", t: "area", d: "", hint: "{{main}} for the previous node's value" },
      { k: "timeout", l: "Timeout (seconds)", t: "num", d: 30 },
    ],
    async run(p) {
      const url = S(p.url, "").trim();
      if (!url) throw new Error("sys.http: no url");
      const method = S(p.method, "GET").toUpperCase();
      let headers = {};
      try { headers = p.headers ? (typeof p.headers === "string" ? JSON.parse(p.headers) : p.headers) : {}; }
      catch { throw new Error("sys.http: headers is not valid JSON"); }
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), Math.max(1, Math.min(600, N(p.timeout, 30))) * 1000);
      try {
        const res = await fetch(url, {
          method, headers,
          body: method === "GET" || method === "DELETE" ? undefined : (p.body == null ? undefined : String(p.body)),
          signal: ac.signal,
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON, and that is fine */ }
        return {
          status: res.status, ok: res.ok,
          headers: Object.fromEntries(res.headers.entries()),
          body: text.length > MAX_OUT ? text.slice(0, MAX_OUT) : text,
          json,
        };
      } finally {
        clearTimeout(t);
      }
    },
  },
};

/**
 * Run one shell command.
 *
 * `sh -c` rather than an argv array, because the point of this node is that it
 * behaves like the terminal — pipes, redirects and globs all work, and a user
 * who typed a pipeline expects a pipeline. That is also exactly why the node is
 * classified `exec` and why it cannot run unattended without a prior grant.
 */
function execShell(command, cwd, timeoutMs) {
  return new Promise((res, rej) => {
    const started = Date.now();
    const shell = process.platform === "win32" ? "powershell.exe" : "/bin/sh";
    const args = process.platform === "win32" ? ["-NoProfile", "-Command", command] : ["-c", command];
    let out = "";
    let err = "";
    let killed = false;

    let child;
    try {
      child = spawn(shell, args, { cwd, env: process.env });
    } catch (e) {
      rej(new Error("sys.bash: could not start a shell (" + e.message + ")"));
      return;
    }

    const timer = setTimeout(() => {
      killed = true;
      /* SIGTERM first, then SIGKILL — a shell that ignores the polite signal
         must still stop, or a scheduled workflow leaks a process every run. */
      child.kill("SIGTERM");
      setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* already gone */ } }, 2000);
    }, timeoutMs);

    child.stdout.on("data", (d) => { if (out.length < MAX_OUT) out += d.toString(); });
    child.stderr.on("data", (d) => { if (err.length < MAX_OUT) err += d.toString(); });
    child.on("error", (e) => { clearTimeout(timer); rej(new Error("sys.bash: " + e.message)); });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const ms = Date.now() - started;
      if (killed) {
        rej(new Error("sys.bash: timed out after " + Math.round(timeoutMs / 1000) + "s"));
        return;
      }
      res({
        exitCode: code == null ? -1 : code,
        signal: signal || null,
        ms,
        stdout: out.length > MAX_OUT ? out.slice(0, MAX_OUT) : out,
        stderr: err.length > MAX_OUT ? err.slice(0, MAX_OUT) : err,
        truncated: out.length >= MAX_OUT || err.length >= MAX_OUT,
      });
    });
  });
}
