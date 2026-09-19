// A directory on disk as a corpus for src/files.js: the source files and
// documents under a root, read once into memory. What counts is small and
// explicit: code and markdown, not tests, builds or dependencies, unless
// the include list says otherwise.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { corpusFrom } from "../src/files.js";

export const DEFAULT_INCLUDE = ["src", "docs", "README.md", "CLAUDE.md", "AGENTS.md"];
export const DEFAULT_EXCLUDE = ["node_modules", "dist", "build", "coverage", ".git", "test", "tests", "__tests__", "spec"];
export const EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx", ".md"];
const MAX_FILE_BYTES = 512 * 1024;

export function readCorpusEntries(root, { include = DEFAULT_INCLUDE, exclude = DEFAULT_EXCLUDE, extensions = EXTENSIONS } = {}) {
  const entries = [];
  const skip = new Set(exclude);
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (!skip.has(name)) walk(full);
        continue;
      }
      if (!extensions.some((extension) => name.endsWith(extension)) || name.endsWith(".d.ts") || stat.size > MAX_FILE_BYTES) continue;
      entries.push([relative(root, full).split("\\").join("/"), readFileSync(full, "utf8")]);
    }
  };
  for (const item of include) {
    const full = join(root, item);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) walk(full);
    else if (stat.size <= MAX_FILE_BYTES) entries.push([item, readFileSync(full, "utf8")]);
  }
  return entries;
}

export function readCorpus(root, options = {}) {
  const entries = readCorpusEntries(root, options);
  return corpusFrom(entries, { name: options.name ?? basename(root), root });
}
