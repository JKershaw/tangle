// A directory of files as a source, behind the same interface as Wikipedia
// (wiki.js): a file is an article, its declarations are sections, its lines
// are sentences, and the identifiers a line names that are declared in the
// corpus are its links. No AST: a declaration is a line that looks like one,
// and a section runs to the next declaration at the same or a shallower
// indent. The corpus lives in memory ({ path → text }), so the page and Node
// read the same thing; Node fills it from disk (scripts/corpus.mjs).
import { contentWords, normalise, stem } from "./text.js";

export const EXTRACT_LIMIT = 4000; // as wiki.js: what one read returns, in characters
export const HITS = 8; // titles a search returns
export const MIN_LINK_LENGTH = 4; // an identifier shorter than this is not a link (get, set, id)

const CODE = /\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/i;
const DOC = /\.(?:md|markdown|txt)$/i;

// ---- declarations ----
// Top level: function, class, interface, type, enum, const/let/var.
const TOP = [
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/,
  /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
  /^(?:export\s+)?(?:declare\s+)?(?:interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/,
  /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/,
];
// A method or field initialiser inside a class body, at the class's indent + 2.
const METHOD = /^(?:(?:public|private|protected|static|readonly|override|async|abstract|get|set|declare|accessor)\s+)*\*?\s*(?:#?[A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/;
const NOT_A_METHOD = /^(?:if|for|while|switch|return|catch|await|else|do|try|new|typeof|throw|case|default|super|function|const|let|var|yield|delete|void)\b/;
const COMMENT = /^\s*(?:\/\/|\/\*|\*|\*\/)/;
const IMPORT = /^(?:import|export\s+\*|export\s+\{|export\s+type\s+\{|require\()/;
const FENCE = /^\s*```/;

// Header comment lines from the top of a file: what the author says the
// file is for, before any import or declaration.
function headerOf(lines) {
  const out = [];
  for (const line of lines) {
    if (!line.trim()) { if (out.length) break; else continue; }
    if (COMMENT.test(line) || /^#!/.test(line)) out.push(line);
    else break;
  }
  return out;
}

function parseCode(lines) {
  const decls = []; // { name, indent, line (0-based), classOf }
  let classOpen = null; // { name, indent, end }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (classOpen && /^\s*\}\s*;?\s*$/.test(line) && line.search(/\S/) === classOpen.indent) { classOpen.end = i; classOpen = null; continue; }
    if (classOpen) {
      const indent = line.search(/\S/);
      if (indent === classOpen.indent + 2 && METHOD.test(line.slice(indent)) && !NOT_A_METHOD.test(line.slice(indent))) {
        const name = line.slice(indent).match(/#?[A-Za-z_$][\w$]*(?=\s*(?:<[^>]*>)?\s*\()/g)?.at(-1);
        if (name) decls.push({ name, indent, line: i, classOf: classOpen.name });
      }
      continue;
    }
    if (line.search(/\S/) !== 0) continue;
    for (const pattern of TOP) {
      const match = line.match(pattern);
      if (!match) continue;
      decls.push({ name: match[1], indent: 0, line: i, classOf: null });
      if (pattern === TOP[1]) classOpen = { name: match[1], indent: 0, end: lines.length };
      break;
    }
  }
  return decls;
}

function parseDoc(lines) {
  const decls = [];
  let fenced = false;
  for (let i = 0; i < lines.length; i++) {
    if (FENCE.test(lines[i])) fenced = !fenced;
    if (fenced) continue;
    const match = lines[i].match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (match) decls.push({ name: match[2].trim(), indent: match[1].length, line: i, classOf: null, heading: true });
  }
  // A document's title (one #) is the lead's heading, not a section, when
  // any deeper heading exists.
  return decls.length > 1 && decls[0].indent === 1 && decls.some((decl) => decl.indent > 1) ? decls.slice(1) : decls;
}

// The comment block directly above a declaration belongs to it.
function commentAbove(lines, at) {
  let start = at;
  while (start > 0 && COMMENT.test(lines[start - 1]) && lines[start - 1].trim()) start--;
  return start;
}

const dedent = (block) => {
  const indents = block.filter((line) => line.trim()).map((line) => line.search(/\S/));
  const common = indents.length ? Math.min(...indents) : 0;
  return block.map((line) => line.slice(common));
};

// FNV-1a, enough to say "this content" in a citation.
export function hashOf(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

// A file parsed into a lead and sections. Each section: { heading, name,
// classOf, start, end (0-based, inclusive), text, size }.
export function parseFile(path, text) {
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
  const doc = DOC.test(path);
  const decls = doc ? parseDoc(lines) : CODE.test(path) ? parseCode(lines) : [];
  const sections = [];
  for (let d = 0; d < decls.length; d++) {
    const decl = decls[d];
    // The section ends where the next declaration at the same or a
    // shallower indent (for a document, the next heading) begins; a class's
    // own section is its head, up to its first method.
    let end = lines.length - 1;
    for (let n = d + 1; n < decls.length; n++) {
      const next = decls[n];
      if (doc ? true : next.indent <= decl.indent || (decl.classOf === null && next.classOf === decl.name)) { end = commentAbove(lines, next.line) - 1; break; }
    }
    const start = doc ? decl.line : commentAbove(lines, decl.line);
    let block = lines.slice(start, end + 1);
    while (block.length && !block.at(-1).trim()) block.pop();
    // A method's block may end with the class's closing brace; a class
    // head's with nothing of its own. Neither is text.
    if (!doc && decl.classOf !== null) while (block.length && /^\s*\}\s*;?\s*$/.test(block.at(-1)) && block.at(-1).search(/\S/) < decl.indent) block.pop();
    const body = dedent(block).join("\n");
    sections.push({ heading: decl.name, name: decl.name, classOf: decl.classOf, start, end: start + block.length - 1, declLine: decl.line, text: body, size: body.length });
  }
  // Headings are an enum: a name repeated in one file is told apart by its
  // class, then by a count.
  const seen = new Map();
  for (const section of sections) {
    const count = (seen.get(section.heading) ?? 0) + 1;
    seen.set(section.heading, count);
    if (count > 1) section.heading = section.classOf ? `${section.classOf}.${section.name}` : `${section.name} (${count})`;
  }
  // The lead: a document's text before its first heading; a code file's
  // header comment and one line per declaration (its signature), so a
  // reader sees what the file holds before choosing a section.
  let lead;
  if (doc) lead = lines.slice(0, sections.length ? sections[0].start : lines.length).join("\n").trim();
  else {
    const header = headerOf(lines);
    const outline = sections.map((section) => lines[section.declLine].trim().replace(/\s*(?:=>|[{=])\s*$/, ""));
    lead = [...header, ...(header.length && outline.length ? [""] : []), ...outline].join("\n").trim();
  }
  if (!lead && !doc) lead = lines.filter((line) => line.trim()).slice(0, 40).join("\n");
  return { path, lines, lead, sections, hash: hashOf(String(text)), doc };
}

// The lines of a read that a model can pick: not blank, with a word in them.
export function lineUnits(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /[A-Za-z]{2}/.test(line));
}

// Tokens for search: words and identifier parts, stemmed, four letters or
// more ("matchesFilter" → matches, filter → match, filter).
export function tokens(text) {
  const parts = String(text ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .match(/[a-z][a-z0-9]{2,}/g) || [];
  return new Set(parts.filter((part) => part.length >= 4 || /^[a-z]+$/.test(part) && part.length === 3).map(stem));
}

// "writes" stems to writ and "write" to write (text.js): two tokens match
// when one begins the other, four letters or more.
export const sameToken = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
const hasToken = (have, token) => { for (const other of have) if (sameToken(token, other)) return true; return false; };

export function corpusFrom(entries, { name = "files", root = null } = {}) {
  const articles = new Map();
  for (const [path, text] of entries) {
    const clean = String(path).replace(/\\/g, "/").replace(/^\.\//, "");
    articles.set(clean, parseFile(clean, text));
  }
  // Every declared name, and where: the link targets.
  const declared = new Map();
  for (const article of articles.values()) {
    for (const section of article.sections) {
      if (article.doc || section.name.length < MIN_LINK_LENGTH) continue;
      if (!declared.has(section.name)) declared.set(section.name, []);
      declared.get(section.name).push({ path: article.path, heading: section.heading });
    }
  }
  const hash = hashOf([...articles.values()].map((article) => `${article.path}:${article.hash}`).sort().join("\n"));
  // The corpus's own name is the subject of every brief about it and no
  // help in finding anything: not a search token.
  const ignore = tokens(name);
  return { name, root, articles, declared, hash, size: articles.size, ignore };
}

// "matchesFilter (src/query-matcher.ts)" → { path, heading }; a bare path → { path }.
export function parseTitle(corpus, title) {
  const text = String(title ?? "").trim();
  const match = text.match(/^(.+?)\s+\(([^()]+)\)$/);
  if (match && corpus.articles.has(match[2])) return { path: match[2], heading: match[1] };
  if (corpus.articles.has(text)) return { path: text, heading: null };
  const byName = [...corpus.articles.keys()].find((path) => normalise(path) === normalise(text) || path.endsWith("/" + text));
  if (byName) return { path: byName, heading: null };
  return null;
}

const sectionUrl = (article, section) => `file:${article.path}#L${(section?.start ?? 0) + 1}${section ? `-L${section.end + 1}` : ""}`;
const wordIn = (word, text) => new RegExp(`(?:^|[^\\p{L}\\p{N}_$])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}\\p{N}_$])`, "iu").test(text);

// ---- the four requests ----
export function search(corpus, term) {
  const wanted = new Set([...tokens(term)].filter((token) => !hasToken(corpus.ignore ?? new Set(), token)));
  const exact = parseTitle(corpus, term);
  const scored = [];
  for (const article of corpus.articles.values()) {
    const pathTokens = tokens(article.path.replace(/\.[^.]+$/, ""));
    let score = 0;
    let best = { line: "", hits: 0 };
    for (const token of wanted) if (hasToken(pathTokens, token)) score += 5;
    for (const section of article.sections) for (const token of wanted) if (hasToken(tokens(section.name), token)) score += 2;
    let matched = 0;
    for (const line of article.lines) {
      if (!line.trim()) continue;
      const have = tokens(line);
      let hits = 0;
      for (const token of wanted) if (hasToken(have, token)) hits++;
      if (hits) matched++;
      if (hits > best.hits) best = { line: line.trim(), hits };
    }
    score += Math.min(matched, 20);
    if (exact && exact.path === article.path) score += 100;
    if (score > 0) scored.push({ path: article.path, score, snippet: best.line.slice(0, 160) });
  }
  scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return scored.slice(0, HITS);
}

const failure = (query, kind, message, extra = {}) => ({ ok: false, tool: "files", query, error: { kind, message }, requests: [], ...extra });

function readLead(corpus, article, query, alternatives = []) {
  return {
    ok: true,
    tool: "files",
    kind: "file",
    lines: true,
    query,
    title: article.path,
    article: article.path,
    section: 0,
    sections: article.sections.length + 1,
    headings: article.sections.map((section) => section.heading),
    sizes: article.sections.map((section) => section.size),
    text: article.lead.slice(0, EXTRACT_LIMIT),
    exact: true,
    alternatives,
    revision: article.hash,
    url: sectionUrl(article, null),
    requests: [],
  };
}

function readSection(corpus, article, index, query, extra = {}) {
  const section = article.sections[index - 1];
  return {
    ok: true,
    tool: "files",
    kind: "file",
    lines: true,
    query,
    title: `${article.path} § ${section.heading}`,
    article: article.path,
    section: index,
    sections: article.sections.length + 1,
    text: section.text.slice(0, EXTRACT_LIMIT),
    exact: true,
    revision: article.hash,
    url: sectionUrl(article, section),
    requests: [],
    ...extra,
  };
}

export function lookupFiles(corpus, query, { searchOnly = false } = {}) {
  const term = String(query ?? "").trim();
  const direct = parseTitle(corpus, term);
  if (direct && !searchOnly) {
    const article = corpus.articles.get(direct.path);
    if (!direct.heading) return readLead(corpus, article, term);
    const index = article.sections.findIndex((section) => section.heading === direct.heading || section.name === direct.heading);
    if (index >= 0) return readSection(corpus, article, index + 1, term);
  }
  const hits = search(corpus, term);
  if (!hits.length) return failure(term, "no_match", `No file in ${corpus.name} matched "${term}".`, { alternatives: [] });
  const titles = hits.map((hit) => hit.path);
  // ranked: the hits are ordered by how much of the term each file holds,
  // so the first is code's best guess (Wikipedia's first hit is not).
  if (searchOnly) return { ok: true, tool: "files", kind: "search", query: term, title: titles[0], alternatives: titles.slice(1), hits: titles, snippets: hits.map((hit) => hit.snippet), ranked: true, requests: [] };
  return readLead(corpus, corpus.articles.get(titles[0]), term, titles.slice(1));
}

export function readFileSection(corpus, title, which) {
  const target = parseTitle(corpus, title);
  if (!target) return failure(title, "no_match", `No file "${title}" in ${corpus.name}.`);
  const article = corpus.articles.get(target.path);
  const headings = article.sections.map((section) => section.heading);
  const wanted = String(which ?? "").trim().toLowerCase();
  const index =
    typeof which === "number"
      ? which
      : Math.max(
          headings.findIndex((heading) => heading.toLowerCase() === wanted),
          headings.findIndex((heading) => heading.toLowerCase().includes(wanted)),
        ) + 1;
  if (index === 0) return readLead(corpus, article, title);
  if (!article.sections[index - 1]) {
    return failure(title, "no_match", typeof which === "number" ? `All ${article.sections.length + 1} sections of "${article.path}" have been read.` : `"${article.path}" has no section "${which}". Its sections: ${headings.join(", ")}.`);
  }
  return readSection(corpus, article, index, title);
}

// The part of a file that is about something: for a declaration title, that
// declaration (a hop reaches it from a line that used it, so it is about the
// subject by construction); for a file, the section naming the phrase best
// (most of its content words), the lead first.
export function readFileAbout(corpus, title, phrase) {
  const target = parseTitle(corpus, title);
  if (!target) return failure(title, "no_match", `No file "${title}" in ${corpus.name}.`);
  const article = corpus.articles.get(target.path);
  const whole = String(phrase ?? "").trim();
  const words = [...contentWords(whole)];
  const ignore = corpus.ignore ?? new Set();
  const names = (text) => {
    if (whole && wordIn(whole, text)) return words.length + 1;
    const have = tokens(text);
    return words.filter((word) => !hasToken(ignore, word) && hasToken(have, word)).length;
  };
  if (target.heading) {
    const index = article.sections.findIndex((section) => section.heading === target.heading || section.name === target.heading);
    if (index < 0) return failure(title, "no_match", `"${article.path}" has no declaration "${target.heading}".`);
    return readSection(corpus, article, index + 1, title, { about: whole });
  }
  // A code file's lead outlines every declaration, so it names a little of
  // everything: the sections are tried first and the lead only when none
  // of them names the phrase.
  const candidates = [...article.sections.map((section, index) => ({ section, index: index + 1 })), { section: null, index: 0 }];
  let best = null;
  for (const candidate of candidates) {
    const text = candidate.section ? candidate.section.text : article.lead;
    const count = names(text);
    if (count > 0 && (!best || count > best.count)) best = { ...candidate, count };
  }
  if (!best) return failure(title, "no_match", `"${article.path}" never mentions ${whole || words.join(", ")}.`);
  return best.index === 0 ? { ...readLead(corpus, article, title), about: whole } : readSection(corpus, article, best.index, title, { about: whole });
}

// The declarations a file (or one of its declarations) names that the
// corpus declares, as "name (path)" titles, most-mentioned first.
export function fileLinks(corpus, title) {
  const target = parseTitle(corpus, title);
  if (!target) return { ok: false, tool: "files", kind: "links", query: title, error: { kind: "no_match", message: `No file "${title}" in ${corpus.name}.` }, requests: [] };
  const article = corpus.articles.get(target.path);
  const scope = target.heading ? article.sections.find((section) => section.heading === target.heading || section.name === target.heading)?.text ?? "" : article.lines.join("\n");
  const counts = [];
  for (const [name, places] of corpus.declared) {
    // A use, not a mention: a call, a member, a type argument or a code
    // span. "collection" in a comment names nothing; ".collection(" does.
    const occurrences = scope.match(new RegExp(`(?:\\.|\`|(?:^|[^\\w$.])(?=[\\w$]+\\s*[(<]))${name.replace(/[$]/g, "\\$&")}(?=$|[^\\w$])`, "gm"))?.length ?? 0;
    if (!occurrences) continue;
    for (const place of places) {
      // A declaration is not a link to itself.
      if (place.path === article.path && target.heading && (place.heading === target.heading || name === target.heading)) continue;
      counts.push({ link: `${name} (${place.path})`, occurrences, own: place.path === article.path });
    }
  }
  counts.sort((a, b) => b.occurrences - a.occurrences || a.link.localeCompare(b.link));
  return { ok: true, tool: "files", kind: "links", query: title, title: article.path, links: [...new Set(counts.map((entry) => entry.link))], requests: [] };
}

// The one driver the walk calls, the same four requests as wikiDriver.
export function fileDriver(corpus) {
  return async (query, { readOn, searchOnly = false, links = false } = {}) => {
    if (links) return fileLinks(corpus, query);
    if (readOn?.about) return readFileAbout(corpus, readOn.article, readOn.about);
    if (readOn) return readFileSection(corpus, readOn.article, readOn.section);
    return lookupFiles(corpus, query, { searchOnly });
  };
}
