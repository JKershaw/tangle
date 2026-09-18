#!/usr/bin/env node
// Prints the numbered sentences of a cached Wikipedia section so a node-eval
// case can be authored against exactly what the model will see:
//   node scripts/node-case.mjs "Dead Sea"                 (lists sections)
//   node scripts/node-case.mjs "Dead Sea" "Receding shoreline"   (numbered sentences; "" for the lead)
import { readFileSync, readdirSync } from "node:fs";
import { splitSentences } from "../src/asks.js";
import { splitSections } from "../src/wiki.js";

export function cachedArticle(title, dir = "evals/wiki-cache") {
  for (const file of readdirSync(dir)) {
    const entry = JSON.parse(readFileSync(`${dir}/${file}`, "utf8"));
    if (!entry.url.includes("prop=extracts")) continue;
    let page;
    try {
      page = Object.values(JSON.parse(entry.body).query.pages)[0];
    } catch {
      continue;
    }
    if (page?.title === title) return { title: page.title, sections: splitSections(page.extract) };
  }
  throw new Error(`"${title}" is not in ${dir}`);
}

export function sectionSentences(title, heading = "") {
  const article = cachedArticle(title);
  const section = article.sections.find((candidate) => candidate.heading === heading);
  if (!section) throw new Error(`No section "${heading}" in ${title}; have: ${article.sections.map((candidate) => candidate.heading || "(lead)").join(", ")}`);
  return splitSentences(section.text);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const [title, heading] = process.argv.slice(2);
  if (!title) {
    console.error('usage: node scripts/node-case.mjs "<article>" ["<section>"]');
    process.exit(2);
  }
  if (heading === undefined) {
    for (const section of cachedArticle(title).sections) console.log(`${section.heading || "(lead)"} · ${splitSentences(section.text).length} sentences · ${section.text.length} chars`);
  } else {
    sectionSentences(title, heading).forEach((sentence, index) => console.log(`${index + 1}. ${sentence}`));
  }
}
