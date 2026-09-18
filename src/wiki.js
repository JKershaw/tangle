// The only tool in live mode: a Wikipedia search followed by the top article's
// summary. Requests are pinned to HTTPS en.wikipedia.org, carry no credentials,
// follow no redirects, and are bounded by a timeout and a byte cap.

export const WIKI_HOST = "en.wikipedia.org";
export const DEFAULT_TIMEOUT_MS = 20000;
export const DEFAULT_MAX_BYTES = 65536;
export const EXTRACT_LIMIT = 4000;

const titlePath = (title) => encodeURIComponent(String(title ?? "").trim().replace(/\s+/g, "_"));

export const searchUrl = (query) =>
  `https://${WIKI_HOST}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(String(query ?? "").trim())}&srlimit=5&format=json&origin=*`;
export const summaryUrl = (title) => `https://${WIKI_HOST}/api/rest_v1/page/summary/${titlePath(title)}`;
export const articleUrl = (title) => `https://${WIKI_HOST}/wiki/${titlePath(title)}`;
export const revisionUrl = (revision) => `https://${WIKI_HOST}/w/index.php?oldid=${revision}`;

export function stripHtml(snippet) {
  return String(snippet ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function readBounded(response, maxBytes) {
  if (!response.body || typeof response.body.getReader !== "function") {
    const text = typeof response.text === "function" ? await response.text() : "";
    const bytes = new TextEncoder().encode(text);
    return bytes.length <= maxBytes
      ? { text, truncated: false, bytes: bytes.length }
      : { text: new TextDecoder().decode(bytes.slice(0, maxBytes)), truncated: true, bytes: bytes.length };
  }
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;
      received += value.length;
      if (received > maxBytes) {
        const keep = maxBytes - (received - value.length);
        if (keep > 0) chunks.push(value.slice(0, keep));
        truncated = true;
        break;
      }
      chunks.push(value);
    }
  } finally {
    if (truncated) await reader.cancel().catch(() => {});
  }
  const joined = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return { text: new TextDecoder().decode(joined), truncated, bytes: truncated ? null : received };
}

// One guarded GET. Never throws: every failure is a { ok: false, error } record
// so the episode runner can persist it in the trace.
export async function fetchWikipedia(url, options = {}) {
  const { fetchImpl = globalThis.fetch, signal, timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES, now = () => Date.now() } = options;
  const started = now();
  const elapsed = () => Math.max(0, now() - started);
  const fail = (kind, message) => ({ ok: false, url, error: { kind, message }, elapsedMs: elapsed() });
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return fail("invalid_url", `"${url}" is not a valid URL.`);
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== WIKI_HOST) {
    return fail("blocked", "Only HTTPS requests to en.wikipedia.org are allowed.");
  }
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forward = () => controller.abort();
  if (signal) signal.aborted ? controller.abort() : signal.addEventListener("abort", forward, { once: true });
  const classify = (error) =>
    timedOut
      ? fail("timeout", `The request did not complete within ${timeoutMs} ms.`)
      : signal?.aborted || error?.name === "AbortError"
        ? fail("cancelled", "The request was cancelled.")
        : null;
  try {
    let response;
    try {
      response = await fetchImpl(parsed.href, {
        method: "GET",
        signal: controller.signal,
        redirect: "error",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
    } catch (error) {
      return classify(error) ?? fail("network", "The browser could not complete the request (network, CORS or DNS). " + String(error?.message || error));
    }
    let body;
    try {
      body = await readBounded(response, maxBytes);
    } catch (error) {
      return classify(error) ?? fail("read_failed", "The response body could not be read: " + String(error?.message || error));
    }
    return { ok: true, url, status: response.status, body: body.text, truncated: body.truncated, bytes: body.bytes, elapsedMs: elapsed() };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forward);
  }
}

const requestRecord = ({ body, ...rest }) => rest;

// ---- articles ----
// One request gives an article's plain text, split on its "== Heading ==" lines
// (index 0 is the lead), plus the revision. Leads are often silent on the actual
// question — the Dead Sea's never mentions recession, which is section 28 of 31
// (experiments/2026-09-17-qwen3-1.7b-dead-sea.md) — so the lead excerpt carries
// the headings and a node can ask for a section by name.
export const EXTRACT_MAX_BYTES = 262144;
export const extractUrl = (title) =>
  `https://${WIKI_HOST}/w/api.php?action=query&prop=extracts|revisions&explaintext=1&redirects=1&rvprop=ids&titles=${titlePath(title)}&format=json&origin=*`;
const SKIPPED_SECTIONS = new Set(["See also", "References", "External links", "Further reading", "Notes", "Bibliography", "Gallery", "Sources", "Citations", "Articles", "Publications", "Selected publications", "Selected works", "Works cited", "Footnotes"]);

// Headings with no text of their own (parents of subsections) are dropped.
export function splitSections(extract) {
  const parts = String(extract ?? "").split(/\n+(?==+ [^=\n]+? =+\n)/);
  return parts
    .map((part) => {
      const match = part.match(/^(=+) ([^=\n]+?) =+\n?([\s\S]*)$/);
      return match ? { heading: match[2].trim(), text: match[3].trim() } : { heading: "", text: part.trim() };
    })
    .filter((section) => section.text.length > 0 && !SKIPPED_SECTIONS.has(section.heading));
}

async function fetchArticle(title, options) {
  const response = await fetchWikipedia(extractUrl(title), { maxBytes: EXTRACT_MAX_BYTES, ...options });
  const record = requestRecord(response);
  if (!response.ok) return { ok: false, kind: "unreachable", message: response.error.message, record };
  let page;
  try {
    page = Object.values(JSON.parse(response.body)?.query?.pages ?? {})[0];
  } catch {
    page = null;
  }
  if (!page || typeof page.extract !== "string" || !page.extract.trim()) {
    return { ok: false, kind: "bad_response", message: `Wikipedia's extract API returned no text for "${title}" (HTTP ${response.status}).`, record };
  }
  const revision = page.revisions?.[0]?.revid;
  return { ok: true, title: String(page.title), sections: splitSections(page.extract), revision: Number.isInteger(revision) ? String(revision) : null, record };
}

const sectionUrl = (title, revision, heading) =>
  (revision ? revisionUrl(revision) : articleUrl(title)) + (heading ? "#" + encodeURIComponent(heading.replace(/\s+/g, "_")) : "");

// Search, then read the top hit's lead. The result is shaped as evidence
// ({ kind, title, text, url, headings }) plus the request records for the trace.
export async function lookupWikipedia(query, options = {}) {
  const term = String(query ?? "").trim();
  const requests = [];
  const failure = (kind, message, extra = {}) => ({ ok: false, tool: "wiki", query: term, error: { kind, message }, requests, ...extra });
  if (!term) return failure("no_match", "No search term was given.");
  const search = await fetchWikipedia(searchUrl(term), options);
  requests.push(requestRecord(search));
  if (!search.ok) return failure("unreachable", search.error.message);
  let hits;
  try {
    hits = JSON.parse(search.body)?.query?.search;
  } catch {
    hits = null;
  }
  if (!Array.isArray(hits)) return failure("bad_response", `Wikipedia's search API answered with something other than a result list (HTTP ${search.status}).`);
  if (hits.length === 0) return failure("no_match", `No Wikipedia article matched "${term}".`, { alternatives: [] });
  const title = String(hits[0].title);
  const alternatives = hits.slice(1).map((hit) => String(hit.title));
  // The walk searches first and reads after the article is chosen.
  if (options.searchOnly) return { ok: true, tool: "wiki", kind: "search", query: term, title, alternatives, hits: [title, ...alternatives], snippets: hits.map((hit) => stripHtml(String(hit.snippet ?? ""))), requests };
  const article = await fetchArticle(title, options);
  requests.push(article.record);
  const exact = article.ok;
  const extract = exact ? article.sections[0]?.text ?? "" : stripHtml(hits[0].snippet);
  if (!extract) return failure("bad_response", `Found the article "${title}" but could not read any text from it.`, { title, alternatives });
  const name = exact ? article.title : title;
  return {
    ok: true,
    tool: "wiki",
    kind: "wiki",
    query: term,
    title: name,
    article: name,
    section: 0,
    headings: exact ? article.sections.slice(1).map((section) => section.heading) : [],
    // Characters per section after the lead, so a brief can skip a heading
    // that is only a short introduction to its subsections.
    sizes: exact ? article.sections.slice(1).map((section) => section.text.length) : [],
    text: extract.slice(0, EXTRACT_LIMIT),
    exact,
    alternatives,
    revision: exact ? article.revision : null,
    url: exact ? sectionUrl(name, article.revision, "") : articleUrl(title),
    requests,
  };
}

// The part of an article that is about something else: the lead if it names
// the phrase (or one of its longer words), else the first section that
// does. A brief's hop child reads the Bombe for what it says about Turing,
// and that is often not in the lead (walk-11 at 8B: seven of ten hop
// articles had no lead sentence naming the subject and were dropped).
const GENERIC_WORDS = new Set(["space", "great", "river", "lake", "sea", "national", "united", "north", "south", "east", "west", "new", "old", "saint", "state", "city", "island", "mount", "system"]);
export function aboutWords(phrase) {
  const words = String(phrase ?? "").split(/\s+/).filter((word) => word.replace(/[^\p{L}\p{N}]/gu, "").length >= 4 && !GENERIC_WORDS.has(word.toLowerCase()));
  return words.length ? words : String(phrase ?? "").split(/\s+/).filter(Boolean);
}
const wordIn = (word, text) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}\\p{N}])`, "iu").test(text);
export async function readWikipediaAbout(title, phrase, options = {}) {
  const requests = [];
  const failure = (kind, message) => ({ ok: false, tool: "wiki", query: title, error: { kind, message }, requests });
  const article = await fetchArticle(title, options);
  requests.push(article.record);
  if (!article.ok) return failure(article.kind, article.message);
  const whole = String(phrase ?? "").trim();
  const words = aboutWords(whole);
  const index = [article.sections.findIndex((section) => whole && wordIn(whole, section.text)), article.sections.findIndex((section) => words.some((word) => wordIn(word, section.text)))].find((found) => found >= 0);
  if (index === undefined) return failure("no_match", `"${article.title}" never mentions ${whole || words.join(", ")}.`);
  const section = article.sections[index];
  return {
    ok: true,
    tool: "wiki",
    kind: "wiki",
    query: title,
    title: section.heading ? `${article.title} § ${section.heading}` : article.title,
    article: article.title,
    section: index,
    sections: article.sections.length,
    about: whole,
    text: section.text.slice(0, EXTRACT_LIMIT),
    exact: true,
    revision: article.revision,
    url: sectionUrl(article.title, article.revision, section.heading),
    requests,
  };
}

// The articles an article links to: what its editors decided the text names.
// The walk offers those that occur in a kept sentence as places to hop to
// (walk.js, hopOut). One request per article, cached like the rest.
export const LINKS_MAX_BYTES = 262144;
export const linksUrl = (title) => `https://${WIKI_HOST}/w/api.php?action=parse&page=${titlePath(title)}&prop=links&redirects=1&format=json&origin=*`;
export async function fetchWikipediaLinks(title, options = {}) {
  const requests = [];
  const failure = (kind, message) => ({ ok: false, tool: "wiki", kind: "links", query: title, error: { kind, message }, requests });
  const response = await fetchWikipedia(linksUrl(title), { maxBytes: LINKS_MAX_BYTES, ...options });
  requests.push(requestRecord(response));
  if (!response.ok) return failure("unreachable", response.error.message);
  let parsed;
  try {
    parsed = JSON.parse(response.body)?.parse;
  } catch {
    parsed = null;
  }
  if (!parsed || !Array.isArray(parsed.links)) return failure("bad_response", `Wikipedia's parse API returned no links for "${title}" (HTTP ${response.status}).`);
  const links = [...new Set(parsed.links.filter((link) => link.ns === 0 && "exists" in link).map((link) => String(link["*"])))];
  return { ok: true, tool: "wiki", kind: "links", query: title, title: String(parsed.title ?? title), links, requests };
}

// Read one section of an article, by index (0 = lead) or by heading.
export async function readWikipediaSection(title, which, options = {}) {
  const requests = [];
  const failure = (kind, message) => ({ ok: false, tool: "wiki", query: title, error: { kind, message }, requests });
  const article = await fetchArticle(title, options);
  requests.push(article.record);
  if (!article.ok) return failure(article.kind, article.message);
  const headings = article.sections.map((section) => section.heading);
  const wanted = String(which ?? "").trim().toLowerCase();
  const index =
    typeof which === "number"
      ? which
      : Math.max(
          headings.findIndex((heading) => heading.toLowerCase() === wanted),
          headings.findIndex((heading) => heading && heading.toLowerCase().includes(wanted)),
        );
  const section = article.sections[index];
  if (!section) {
    return failure(
      "no_match",
      typeof which === "number"
        ? `All ${article.sections.length} sections of "${article.title}" have been read. Try a different term or decompose.`
        : `"${article.title}" has no section "${which}". Its sections: ${headings.filter(Boolean).join(", ")}.`,
    );
  }
  return {
    ok: true,
    tool: "wiki",
    kind: "wiki",
    query: title,
    title: section.heading ? `${article.title} § ${section.heading}` : article.title,
    article: article.title,
    section: index,
    sections: article.sections.length,
    text: section.text.slice(0, EXTRACT_LIMIT),
    exact: true,
    revision: article.revision,
    url: sectionUrl(article.title, article.revision, section.heading),
    requests,
  };
}

// The one Wikipedia driver the walk calls, in either runtime: a search and
// read, one section, the part about something, or the links. The page wraps
// it with a cache (main.js); Node with the recording (scripts/recording.mjs).
export function wikiDriver({ fetchImpl = globalThis.fetch } = {}) {
  return (query, { signal, readOn, searchOnly = false, links = false }) => {
    const options = { signal, fetchImpl, searchOnly };
    if (links) return fetchWikipediaLinks(query, options);
    if (readOn?.about) return readWikipediaAbout(readOn.article, readOn.about, options);
    if (readOn) return readWikipediaSection(readOn.article, readOn.section, options);
    return lookupWikipedia(query, options);
  };
}
