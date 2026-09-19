// Actions (ROADMAP milestone 6): what code can run for a node, in a worktree
// of the corpus, with the result as evidence. The list is code's: the
// corpus's own scripts (package.json) and two read-only git commands. The
// model only picks one from that list (asks.js "action"); nothing it says
// becomes a command. A worktree is made once per run from the corpus's HEAD
// and removed when the run closes, so a later write action has a sandbox
// and the checkout is never touched; node_modules is linked in read-only.
// Node only: the page never runs anything.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resultRecord } from "../src/source.js";

export const SCRIPT_NAMES = Object.freeze(["test", "lint", "typecheck", "build", "check"]);
export const OUTPUT_CHARS = 4000;
export const DEFAULT_TIMEOUT_MS = 5 * 60000;

const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

// The actions a corpus offers: its scripts by name, then the git views.
export function listActions(root) {
  const actions = [];
  const pkg = join(root, "package.json");
  if (existsSync(pkg)) {
    const scripts = JSON.parse(readFileSync(pkg, "utf8")).scripts ?? {};
    for (const name of SCRIPT_NAMES) if (scripts[name]) actions.push({ name: `npm run ${name}`, description: `run the ${name} script: ${scripts[name]}`, argv: ["npm", "run", "--silent", name] });
  }
  if (existsSync(join(root, ".git"))) {
    actions.push({ name: "git status", description: "what is changed in the worktree", argv: ["git", "status", "--short"] });
    actions.push({ name: "git diff", description: "the changes made so far, as a diff", argv: ["git", "diff"] });
  }
  return actions;
}

// The tail of an output, since the end is where a test runner sums up.
export const tailOf = (text, limit = OUTPUT_CHARS) => (text.length > limit ? "[…]\n" + text.slice(-limit) : text);

export function actionDriver(root, { timeoutMs = DEFAULT_TIMEOUT_MS, name = null } = {}) {
  const actions = listActions(root);
  let worktree = null;
  const ensureWorktree = () => {
    if (worktree) return worktree;
    if (!existsSync(join(root, ".git"))) return (worktree = root);
    const dir = mkdtempSync(join(tmpdir(), "tangle-worktree-"));
    rmSync(dir, { recursive: true, force: true });
    git(root, ["worktree", "add", "--detach", "-q", dir, "HEAD"]);
    if (existsSync(join(root, "node_modules")) && !existsSync(join(dir, "node_modules"))) symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
    return (worktree = dir);
  };
  return {
    source: name ?? "shell",
    list: () => actions.map(({ name, description }) => ({ name, description })),
    worktree: () => worktree,
    // Runs one named action. Never throws for a failing command: the exit
    // code and the output are the result. Resolves to a result (source.js).
    async run(actionName, { signal } = {}) {
      const action = actions.find((entry) => entry.name === actionName);
      if (!action) return { ok: false, kind: "error", source: name ?? "shell", query: actionName, error: { kind: "no_match", message: `No action named "${actionName}". The actions: ${actions.map((entry) => entry.name).join(", ")}.` } };
      const cwd = ensureWorktree();
      const started = performance.now();
      const output = await new Promise((resolve) => {
        const child = spawn(action.argv[0], action.argv.slice(1), { cwd, env: { ...process.env, CI: "1", FORCE_COLOR: "0" }, stdio: ["ignore", "pipe", "pipe"] });
        let text = "";
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, timeoutMs);
        const abort = () => child.kill("SIGKILL");
        signal?.addEventListener("abort", abort, { once: true });
        child.stdout.on("data", (chunk) => (text += chunk));
        child.stderr.on("data", (chunk) => (text += chunk));
        child.on("error", (error) => resolve({ text: text + `\n${error.message}`, exit: null, timedOut }));
        child.on("close", (code, sig) => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
          resolve({ text, exit: code ?? (sig ? `signal ${sig}` : null), timedOut });
        });
      });
      const ms = Math.round(performance.now() - started);
      return resultRecord({ source: name ?? "shell", query: actionName, title: `${actionName} → ${output.timedOut ? `no answer in ${timeoutMs / 1000} s` : output.exit === 0 ? "exit 0" : `exit ${output.exit}`}`, text: tailOf(output.text.replace(/\x1b\[[0-9;]*m/g, "")), exit: output.timedOut ? null : output.exit, ms, cwd });
    },
    close() {
      if (worktree && worktree !== root) {
        try {
          git(root, ["worktree", "remove", "--force", worktree]);
        } catch {
          rmSync(worktree, { recursive: true, force: true });
        }
        worktree = null;
      }
    },
  };
}
