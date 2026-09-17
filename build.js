// Bundles src/main.js (with WebLLM) and inlines it into src/page.html.
// Output: docs/index.html, a single self-contained page that GitHub Pages can serve.
// `node build.js --out <path>` writes elsewhere, for a development copy that can
// be served beside the committed build while an experiment is still using it.
import { build } from "esbuild";
import { dirname } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const outIndex = process.argv.indexOf("--out");
const out = outIndex === -1 ? "docs/index.html" : process.argv[outIndex + 1];

const result = await build({
  entryPoints: ["src/main.js"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2022"],
  platform: "browser",
  legalComments: "none",
  logLevel: "warning",
  write: false,
});
let js = result.outputFiles[0].text;
// A closing script tag or a comment opener inside the bundle would end the inline
// script early. esbuild escapes these itself; fail loudly if that ever changes.
if (/<\/script/i.test(js) || js.includes("<!--")) throw new Error("Bundle contains a sequence that would break inline embedding.");
const page = readFileSync("src/page.html", "utf8");
if (!page.includes("<!-- BUNDLE -->")) throw new Error("src/page.html is missing the bundle marker.");
mkdirSync(dirname(out), { recursive: true });
const html = page.replace("<!-- BUNDLE -->", () => js);
writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1024 / 1024).toFixed(2)} MB (bundle ${(js.length / 1024 / 1024).toFixed(2)} MB)`);
