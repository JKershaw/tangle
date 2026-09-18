#!/usr/bin/env node
// Screenshot a built page, optionally with a recorded run imported, so a
// layout can be judged at the size it actually reaches rather than at the
// nine nodes the simulation produces:
//   node scripts/shot.mjs .dev/index.html out.png --run experiments/<run>.json
//   node scripts/shot.mjs docs/index.html out.png --simulate --width 1200
// --full captures the whole page; --node <id> selects a node first.
import { readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "./lab.mjs";

const args = parseArgs(process.argv.slice(2));
const [pagePath, outPath] = args._;
if (!pagePath || !outPath) {
  console.error("usage: node scripts/shot.mjs <page.html> <out.png> [--run <export.json>] [--simulate] [--width N] [--height N] [--full] [--node <id>] [--dark]");
  process.exit(2);
}
const { chromium } = await import("playwright-core");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: Number(args.width ?? 1440), height: Number(args.height ?? 1000) },
  deviceScaleFactor: 2,
  colorScheme: args.dark ? "dark" : "light",
});
const problems = [];
page.on("pageerror", (error) => problems.push(String(error)));
page.on("console", (message) => message.type() === "error" && problems.push(message.text()));
page.on("dialog", (dialog) => dialog.accept());
await page.goto(pathToFileURL(pagePath).href);

if (args.run) {
  // The import input is the page's own route in; driving it keeps the
  // screenshot honest about what a visitor would see.
  await page.setInputFiles("#importFile", { name: "run.json", mimeType: "application/json", buffer: Buffer.from(readFileSync(args.run, "utf8")) });
  await page.waitForFunction(() => document.querySelectorAll(".graph-node").length > 1, null, { timeout: 15000 });
  await page.click("#fit");
} else if (args.simulate) {
  await page.click("#run");
  await page.waitForFunction(() => !window.__tangle.busy(), null, { timeout: 60000 });
  await page.click("#fit");
}
if (args.node) await page.click(`.graph-node[data-id="${args.node}"]`);
await page.waitForTimeout(600);
mkdirSync(dirname(outPath), { recursive: true });
await page.screenshot({ path: outPath, fullPage: !!args.full });
console.log(`${await page.locator(".graph-node").count()} nodes · wrote ${outPath}${problems.length ? ` · page problems: ${problems.slice(0, 3).join(" | ")}` : ""}`);
await browser.close();
