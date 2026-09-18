// Small text helpers shared by the summariser and the graders. Everything here
// is deliberately crude: a flag, not a verdict.

export const STOPWORDS = new Set(["because", "between", "through", "without", "including", "process", "processes", "involves", "involved", "primarily", "additionally", "significant", "however", "related", "various", "several", "different", "overall", "another", "further", "within", "against", "towards", "provided", "evidence", "excerpts", "question"]);

// Strip common suffixes so "reduced" matches "reduce" and "contributes" matches "contribution".
export const stem = (word) => word.replace(/(ations?|ution|ing|ed|es|s|ly|ity|al|ive)$/, "");

// Content words of six or more letters, stemmed, minus stopwords.
export const terms = (text) => new Set((String(text).toLowerCase().match(/[a-z][a-z'-]{5,}/g) || []).filter((word) => !STOPWORDS.has(word)).map(stem));

// Words in a finding that appear in none of the given excerpts ({title, text}).
export function missingWords(finding, excerpts) {
  const support = new Set(excerpts.flatMap((record) => [...terms((record.title ?? "") + " " + (record.text ?? ""))]));
  return [...terms(finding)].filter((word) => !support.has(word));
}

// Lowercase, punctuation stripped, whitespace collapsed: for comparing questions and queries.
export const normalise = (text) =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/§]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

// "Jordan River|National Water Carrier" → true when any alternative occurs in the text.
export const mentions = (text, alternatives) => {
  const haystack = normalise(text);
  return String(alternatives)
    .split("|")
    .some((alternative) => haystack.includes(normalise(alternative)));
};

// Content words of a question: four or more letters, stemmed, minus the
// words that only make it a question. For deciding whether a child question
// is really its parent again.
const QUESTION_WORDS = new Set("what which when where whom does doing did have been being there their this that these those from with into about would could should keep going happen happens happened cause causes caused reason reasons factor factors contribute contributes primary main".split(" "));
export const contentWords = (text) => new Set((String(text).toLowerCase().replace(/'s\b/g, "").match(/[a-z][a-z'-]{3,}/g) || []).filter((word) => !QUESTION_WORDS.has(word)).map(stem));

// A child question that keeps every content word of its parent and adds
// almost nothing is the parent rephrased, not a smaller question: "What
// causes the Dead Sea to shrink?" under "Why is the Dead Sea shrinking?"
// (node evals, 2026-09-18). One that keeps them but asks about two or more
// new things ("What causes the energy exchanges that drive the water cycle?")
// is narrower. A flag, not a verdict: "recession" for "shrinking" gets past it.
export function isParaphrase(child, parent) {
  const wanted = contentWords(parent);
  if (!wanted.size) return normalise(child) === normalise(parent);
  const have = contentWords(child);
  const added = [...have].filter((word) => !wanted.has(word)).length;
  return [...wanted].every((word) => have.has(word)) && added < 2;
}
