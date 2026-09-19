// Actions (ROADMAP milestone 6): code lists what can be run, runs it in a
// worktree of the corpus, and the result is evidence. The model never
// names a command.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { actionDriver, listActions, tailOf } from "../scripts/actions.mjs";
import { checkResult, evidenceOf } from "../src/source.js";

// A tiny git repository with a test script that prints a summary and a
// lint script that fails.
function repo() {
  const root = mkdtempSync(join(tmpdir(), "tangle-actions-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fixture", scripts: { test: "node -e \"console.log('ran 3 tests\\nall passed')\"", lint: "node -e \"console.error('lint: 2 problems'); process.exit(1)\"" } }));
  writeFileSync(join(root, "README.md"), "# fixture\n");
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "-q");
  git("-c", "user.email=t@t", "-c", "user.name=t", "add", ".");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "fixture");
  return root;
}

test("the actions a corpus offers are its scripts and two read-only git views, listed by code", () => {
  const root = repo();
  assert.deepEqual(listActions(root).map((action) => action.name), ["npm run test", "npm run lint", "git status", "git diff"]);
  assert.match(listActions(root)[0].description, /run the test script/);
  assert.deepEqual(listActions(mkdtempSync(join(tmpdir(), "tangle-empty-"))), []);
});

test("an action runs in a worktree of the corpus, its output tail and exit code are the result, a failing command is a result too, and the worktree goes when the driver closes", async () => {
  const root = repo();
  const driver = actionDriver(root, { name: "fixture" });
  assert.equal(driver.worktree(), null, "no worktree until something runs");
  const passed = await driver.run("npm run test");
  assert.equal(checkResult(passed), null);
  assert.equal(passed.kind, "result");
  assert.equal(passed.source, "fixture");
  assert.equal(passed.exit, 0);
  assert.match(passed.text, /ran 3 tests\nall passed/);
  assert.equal(passed.title, "npm run test → exit 0");
  assert.ok(driver.worktree() && driver.worktree() !== root && existsSync(join(driver.worktree(), "package.json")), "ran in a worktree, not the checkout");
  assert.equal(readFileSync(join(root, "README.md"), "utf8"), "# fixture\n");
  const failed = await driver.run("npm run lint");
  assert.equal(failed.ok, true, "a failing command is still a result");
  assert.equal(failed.exit, 1);
  assert.match(failed.text, /lint: 2 problems/);
  assert.equal(failed.title, "npm run lint → exit 1");
  const status = await driver.run("git status");
  assert.equal(status.exit, 0);
  const unknown = await driver.run("rm -rf /");
  assert.equal(unknown.ok, false);
  assert.match(unknown.error.message, /No action named "rm -rf \/"/);
  const evidence = evidenceOf(passed);
  assert.equal(evidence.kind, "result");
  assert.equal(evidence.exit, 0);
  assert.equal(evidence.units, "lines");
  const worktree = driver.worktree();
  driver.close();
  assert.equal(driver.worktree(), null);
  assert.equal(existsSync(worktree), false, "the worktree is removed");
  assert.equal(tailOf("a".repeat(10), 4), "[…]\naaaa");
});

// The walk with actions: over the fixture corpus (test/fixtures/corpus), a
// brief's root hands its sections down and, offered the commands, has the
// scripted model pick the first; the action child runs it and the profile
// gains its result as a cited paragraph.
import { createRun, nextRunnable } from "../src/graph.js";
import { runWalk } from "../src/walk.js";
import { fileDriver, corpusFrom } from "../src/files.js";
import { readCorpusEntries } from "../scripts/corpus.mjs";
import { SCRIPTED } from "../src/scripted.js";
import { resultRecord } from "../src/source.js";

test("a brief's root may hand down one command the model picks from the list code prepared; its child runs it and the result is a cited paragraph of the profile", async () => {
  const CORPUS = new URL("./fixtures/corpus", import.meta.url).pathname;
  const corpus = corpusFrom(readCorpusEntries(CORPUS), { name: "tinystore", root: CORPUS });
  const ran = [];
  const actions = {
    list: () => [{ name: "npm run test", description: "run the test script" }, { name: "git status", description: "what is changed" }],
    run: async (name) => (ran.push(name), resultRecord({ source: "tinystore", query: name, title: `${name} → exit 0`, text: "ℹ tests 12\nℹ pass 12\nℹ fail 0\n", exit: 0, ms: 40 })),
  };
  const run = createRun("Tell me how Tinystore persists writes to disk", "live");
  for (let guard = 0; nextRunnable(run) && guard < 80; guard++) assert.equal(await runWalk(run, { ask: SCRIPTED.first, wiki: fileDriver(corpus), actions, source: "files", ignore: ["tinystore"], variants: { sentence: "list", article: "snippets" } }), true, run.nodes.find((node) => node.status === "error")?.reason);
  const action = run.nodes.find((node) => node.kind === "action");
  assert.ok(action, "an action child");
  assert.equal(action.action, "npm run test");
  assert.deepEqual(ran, ["npm run test"], "run once");
  assert.equal(action.status, "resolved");
  assert.equal(action.finding, "ℹ tests 12\nℹ pass 12\nℹ fail 0");
  const record = run.evidence.find((entry) => entry.id === action.evidence[0]);
  assert.equal(record.kind, "result");
  assert.equal(record.exit, 0);
  assert.equal(run.nodes[0].status, "resolved");
  assert.match(run.nodes[0].finding, /ℹ fail 0/, "the profile carries the result");
  assert.ok(run.trace.some((event) => event.event === "action_chosen" && event.chosen === "npm run test"));
  assert.ok(run.trace.some((event) => event.event === "action_run" && event.exit === 0));
  // Without actions, the same brief grows no action child and asks nothing about one.
  const plain = createRun("Tell me how Tinystore persists writes to disk", "live");
  for (let guard = 0; nextRunnable(plain) && guard < 80; guard++) await runWalk(plain, { ask: SCRIPTED.first, wiki: fileDriver(corpus), source: "files", ignore: ["tinystore"], variants: { sentence: "list", article: "snippets" } });
  assert.ok(!plain.nodes.some((node) => node.kind === "action"));
  assert.ok(!plain.trace.some((event) => event.event === "action_chosen"));
});
