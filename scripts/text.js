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
