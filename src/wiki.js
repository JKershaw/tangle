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

// Search, then summarise the top hit. The result is shaped as evidence
// ({ kind, title, text, url }) plus the request records for the trace.
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
  const summary = await fetchWikipedia(summaryUrl(title), options);
  requests.push(requestRecord(summary));
  let extract = "";
  let revision = null;
  if (summary.ok && summary.status < 400) {
    try {
      const parsed = JSON.parse(summary.body);
      extract = String(parsed?.extract ?? "").trim();
      revision = typeof parsed?.revision === "string" && /^\d+$/.test(parsed.revision) ? parsed.revision : null;
    } catch {
      extract = "";
    }
  }
  const exact = extract !== "";
  if (!exact) extract = stripHtml(hits[0].snippet);
  if (!extract) return failure("bad_response", `Found the article "${title}" but could not read any text from it.`, { title, alternatives });
  return {
    ok: true,
    tool: "wiki",
    kind: "wiki",
    query: term,
    title,
    text: extract.slice(0, EXTRACT_LIMIT),
    exact,
    alternatives,
    revision,
    url: revision ? revisionUrl(revision) : articleUrl(title),
    requests,
  };
}
