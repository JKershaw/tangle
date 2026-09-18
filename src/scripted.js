// Scripted models: answer an ask without a model, deterministically, so the
// two runtimes (the page, Node) can be run on the same seed and recording and
// their graphs compared (test/parity.test.js). Not a baseline of anything.
export const SCRIPTED = Object.freeze({
  // The first choice offered: sentence 1, the first article, the first
  // section, yes. A string ask gets "none".
  first(call) {
    const [field, property] = Object.entries(call.schema.properties)[0];
    const options = property.enum ?? null;
    const pick = options ? (options.find((option) => !["none", "0"].includes(option)) ?? options[0]) : "none";
    return { text: JSON.stringify({ [field]: pick }), tokens: 0 };
  },
});
