import { test } from "node:test";
import assert from "node:assert/strict";
import { corpusFrom, fileLinks, parseFile } from "../src/files.js";
import { readCorpusEntries } from "../scripts/corpus.mjs";

const ROOT = new URL("./fixtures/corpus-shapes", import.meta.url).pathname;
const entries = () => readCorpusEntries(ROOT, { include: ["four-space.ts", "plain.js"] });
const file = (name) => parseFile(name, entries().find(([path]) => path === name)[1]);

test("a class body indented by four spaces still yields its methods as sections", () => {
  const wide = file("four-space.ts");
  const headings = wide.sections.map((section) => section.heading);
  assert.ok(headings.includes("Wide"), headings.join(", "));
  assert.ok(headings.includes("load"), "a public static async method");
  assert.equal(wide.sections.find((section) => section.heading === "load").classOf, "Wide");
});

test("a field holding an arrow function, a getter and a generator are declarations", () => {
  const wide = file("four-space.ts");
  const headings = wide.sections.map((section) => section.heading);
  assert.ok(headings.includes("normalise"), "arrow-function field: " + headings.join(", "));
  assert.ok(headings.includes("size"), "getter");
  assert.ok(headings.includes("pick"), "a top-level const arrow function");
  assert.ok(headings.includes("helper"), "export default function");
  const plain = file("plain.js");
  assert.ok(plain.sections.map((section) => section.heading).includes("numbers"), "generator");
});

test("overload signatures belong to one section with the implementation", () => {
  const wide = file("four-space.ts");
  const adds = wide.sections.filter((section) => section.name === "add");
  assert.equal(adds.length, 1, wide.sections.map((section) => section.heading).join(", "));
  assert.ok(adds[0].text.includes("add(item: string, twice: boolean): void;"));
  assert.ok(adds[0].text.includes("this.items.push(this.normalise(item));"));
});

test("an object literal's methods are not sections, a decorator belongs to the class below it, and a lone header line is the lead", () => {
  const plain = file("plain.js");
  const headings = plain.sections.map((section) => section.heading);
  assert.deepEqual(headings, ["table", "Small", "run", "numbers"]);
  const small = plain.sections.find((section) => section.heading === "Small");
  assert.ok(small.text.startsWith("@decorated"), small.text.split("\n")[0]);
  assert.ok(plain.lead.startsWith("// A module with no header beyond this line"));
});

test("a section's text stops at the next declaration's comment and a method's text ends with its own closing brace", () => {
  const wide = file("four-space.ts");
  const load = wide.sections.find((section) => section.heading === "load");
  assert.ok(load.text.trimEnd().endsWith("}"), JSON.stringify(load.text.slice(-40)));
  assert.ok(!load.text.includes("export default function"), "the next top-level declaration is not inside");
  const normalise = wide.sections.find((section) => section.heading === "normalise");
  assert.ok(normalise.text.startsWith("// A field holding an arrow function"));
  assert.ok(!normalise.text.includes("get size"));
});

test("links come from uses across files; an object literal's method is not a declaration to link to", () => {
  const corpus = corpusFrom(entries(), { name: "shapes" });
  const links = fileLinks(corpus, "plain.js").links;
  assert.ok(links.includes("helper (four-space.ts)"), links.join(", "));
  assert.ok(!links.some((link) => link.startsWith("double ")), "double is an object-literal method");
  const own = fileLinks(corpus, "load (four-space.ts)").links;
  assert.deepEqual(own, ["Wide (four-space.ts)"], "a method's links are the declarations it calls; add has three letters and is not a link");
  assert.ok(fileLinks(corpus, "add (four-space.ts)").links.includes("normalise (four-space.ts)"));
});
