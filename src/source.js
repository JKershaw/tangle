// The one shape every source answers in (REVIEW.md, step 2). A source is
// five requests behind one call, `driver(query, { searchOnly, readOn, links })`:
// a search for a term, the lead of an article with its headings, one
// section, the part about a phrase, and the links. Each driver builds its
// answers here, so the walk reads one shape and an evidence record is built
// from the result rather than being the result. `units` says what the
// article's sentences are: prose sentences, or the lines of a file.
export const KINDS = Object.freeze(["search", "read", "links", "error"]);
export const UNITS = Object.freeze(["sentences", "lines"]);

// A search: titles in the source's order, a snippet each. `ranked` says the
// order is the source's own ranking, so the first hit is read when the model
// says none; Wikipedia's order is not, so the model picks.
export function searchResult({ source, query, hits, snippets = [], ranked = false, requests = [] }) {
  const titles = hits.map(String);
  return { ok: true, kind: "search", source, query, title: titles[0] ?? null, alternatives: titles.slice(1), hits: titles, snippets, ranked, requests };
}

// A read: the lead (section 0, with the article's headings, sizes and
// summaries) or one section, or the part about a phrase. `exact` is false
// when the text is a search snippet standing in for an article that could
// not be fetched.
export function readResult({ source, query, title, article, section = 0, sections = null, headings = [], sizes = [], summaries = [], text, units = "sentences", url = null, revision = null, exact = true, alternatives = [], about = null, requests = [] }) {
  if (!UNITS.includes(units)) throw new Error(`Unknown units: ${units}`);
  return { ok: true, kind: "read", source, query, title, article, section, sections, headings, sizes, summaries, text: String(text), units, lines: units === "lines", url, revision, exact, alternatives, about, requests };
}

export function linksResult({ source, query, title, links, requests = [] }) {
  return { ok: true, kind: "links", source, query, title, links: [...new Set(links.map(String))], requests };
}

export function failure({ source, query, kind, message, requests = [], ...extra }) {
  return { ok: false, kind: "error", source, query, error: { kind, message }, requests, ...extra };
}

// What the walk keeps of a read: enough to cite, show and grade it, and
// nothing about how it was fetched.
// A driver built here gives every field; a test's minimal driver gives a
// title and text, and the rest takes the contract's defaults.
export function evidenceOf(result) {
  if (!result?.ok || typeof result.text !== "string" || result.kind === "search" || result.kind === "links") throw new Error("Only a read is evidence.");
  const { source = result.tool ?? "wiki", title, article = title, section = 0, headings = [], sizes = [], summaries = [], text, url = null, revision = null, exact = true } = result;
  const units = result.units ?? (result.lines ? "lines" : "sentences");
  return { kind: "read", source, title, article, section, headings, sizes, summaries, text, units, lines: units === "lines", url, revision, exact };
}

// True when a driver's answer has the shape above; the reason otherwise.
export function checkResult(result) {
  if (!result || typeof result !== "object") return "not an object";
  if (!KINDS.includes(result.kind)) return `kind ${result.kind}`;
  if (typeof result.source !== "string" || !result.source) return "no source";
  if (result.ok === false) return result.error?.kind && result.error?.message ? null : "an error without kind and message";
  if (result.kind === "search") return Array.isArray(result.hits) && Array.isArray(result.snippets) && typeof result.ranked === "boolean" ? null : "a search without hits, snippets and ranked";
  if (result.kind === "links") return Array.isArray(result.links) ? null : "links without links";
  if (typeof result.text !== "string" || !result.title || !result.article) return "a read without text, title and article";
  if (!UNITS.includes(result.units) || result.lines !== (result.units === "lines")) return "a read whose units and lines disagree";
  return Array.isArray(result.headings) && Array.isArray(result.sizes) && Array.isArray(result.summaries) ? null : "a read without headings, sizes and summaries";
}
