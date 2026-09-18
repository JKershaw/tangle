// The asks: the smallest questions the harness puts to a model, one decision
// per call. A visit is sequenced by code (episode.js); the model only ever
// picks from things code prepared, or names one short thing when there is
// nothing to pick from. Each ask has variants — phrasings and shapes of the
// same decision — so the node evals (scripts/node-eval.mjs, evals/node/) can
// measure which is the simplest ask a small model answers reliably. The page
// and the eval runner build calls from the same definitions.
//
// An ask variant turns an input into one or more calls ({ messages, schema,
// maxTokens }) and combines the raw outputs into one answer. Schemas stay tiny
// and few: web-llm compiles a grammar per distinct schema (see webllm.js).

export const ASK_VERSION = "asks-3";
export const NO_THINK = " /no_think";

// Sentences are what the model picks between, so they are made by code, the
// same way every time. Fragments shorter than minLength (initials, "c. 1200",
// list bullets) are joined to their neighbour rather than shown as choices.
export function splitSentences(text, { minLength = 25 } = {}) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const raw = clean.split(/(?<=[.!?]["”’)]?)\s+(?=["“(]?[A-Z0-9])/);
  const sentences = [];
  for (const part of raw) {
    const piece = part.trim();
    if (!piece) continue;
    if (sentences.length && (piece.length < minLength || /(\b[A-Z]|\b(?:c|ca|e\.g|i\.e|vs|St|Mt|Dr|No)\.)$/.test(sentences.at(-1)))) sentences[sentences.length - 1] += " " + piece;
    else sentences.push(piece);
  }
  return sentences;
}

const numbered = (sentences) => sentences.map((sentence, index) => `${index + 1}. ${sentence}`).join("\n");
const labels = (count) => Array.from({ length: count }, (_, index) => String(index + 1));
const enumSchema = (key, values) => Object.freeze({ type: "object", properties: { [key]: { enum: [...values] } }, required: [key], additionalProperties: false });
const stringSchema = (key, maxLength) => Object.freeze({ type: "object", properties: { [key]: { type: "string", maxLength } }, required: [key], additionalProperties: false });

export function parseJson(raw) {
  const text = String(raw ?? "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
}

const single = (build, read) => ({
  calls: (input) => [build(input)],
  combine: (outputs, input) => read(parseJson(outputs[0]), input),
});

// ---- sentence: which sentence answers the question? ----
// Input { question, sentences: [string] }. Answer: "1".."N" or "none".
const SENTENCE_SYSTEM = {
  json: `Which numbered sentence answers the question? Reply with JSON: {"sentence": "<number>"}, or {"sentence": "none"} if no sentence answers it.`,
  list: `You are given a question and numbered sentences. Pick the one sentence that answers the question. If none of them answers it, pick none. Reply with JSON only.`,
  strict: `Pick the sentence that states the answer to the question. Only pick a sentence if the answer is written in it; do not use anything you know. If no sentence states the answer, reply none. Reply with JSON only.`,
  brief: `You are given a brief and numbered sentences from an encyclopedia. Pick the one sentence that says the most important thing for the brief: a fact, event, achievement or consequence. Pass over sentences that are vague, repeat what has been said, or are about something else. If nothing is worth keeping, pick none. Reply with JSON only.`,
};
const sentenceCall = (system, user) => (input) => ({
  messages: [
    { role: "system", content: system + NO_THINK },
    { role: "user", content: user(input) },
  ],
  schema: enumSchema("sentence", [...labels(input.sentences.length), "none"]),
  maxTokens: 24,
});
const readSentence = (parsed) => String(parsed.sentence);

export const ASKS = Object.freeze({
  sentence: {
    describe: (input) => `${input.sentences.length} sentences`,
    variants: {
      json: single(sentenceCall(SENTENCE_SYSTEM.json, (input) => JSON.stringify({ question: input.question, sentences: Object.fromEntries(input.sentences.map((sentence, index) => [String(index + 1), sentence])) })), readSentence),
      list: single(sentenceCall(SENTENCE_SYSTEM.list, (input) => `Question: ${input.question}\n\n${numbered(input.sentences)}\n\nWhich sentence answers the question? Reply {"sentence": "<number>"} or {"sentence": "none"}.`), readSentence),
      // A brief ("Tell me about X and the impact of his work") has no single
      // answering sentence; the pick is the sentence most worth keeping.
      brief: single(sentenceCall(SENTENCE_SYSTEM.brief, (input) => `Brief: ${input.question}\n\n${numbered(input.sentences)}\n\nWhich sentence is most worth keeping for the brief? Reply {"sentence": "<number>"} or {"sentence": "none"}.`), readSentence),
      strict: single(sentenceCall(SENTENCE_SYSTEM.strict, (input) => `Question: ${input.question}\n\n${numbered(input.sentences)}\n\nReply {"sentence": "<number>"} or {"sentence": "none"}.`), readSentence),
      // The source named: 1.7B picked an Aral Sea sentence as the answer to a
      // Dead Sea question when the sentences came unlabelled
      // (experiments/2026-09-18-qwen3-1.7b-dead-sea-walk-1). Input may carry
      // { titles: [string] } parallel to sentences.
      titled: single(sentenceCall(SENTENCE_SYSTEM.list + ` Each sentence is labelled with the Wikipedia article it comes from; a sentence about a different subject does not answer the question.`, (input) => `Question: ${input.question}\n\n${input.sentences.map((sentence, index) => `${index + 1}. [${input.titles?.[index] ?? "source"}] ${sentence}`).join("\n")}\n\nWhich sentence answers the question? Reply {"sentence": "<number>"} or {"sentence": "none"}.`), readSentence),
      // "none" as an ordinary numbered choice: 1.7B found the answering
      // sentence in every positive case but picked one anyway when nothing
      // answered (evals/node/results.md, f571e0b). A pick from a list may be
      // easier than invoking a special value.
      zero: {
        calls: (input) => [{
          messages: [
            { role: "system", content: SENTENCE_SYSTEM.list + NO_THINK },
            { role: "user", content: `Question: ${input.question}\n\n0. None of the sentences below answers the question.\n${numbered(input.sentences)}\n\nReply {"sentence": "<number>"}.` },
          ],
          schema: enumSchema("sentence", ["0", ...labels(input.sentences.length)]),
          maxTokens: 24,
        }],
        combine: (outputs) => {
          const pick = String(parseJson(outputs[0]).sentence);
          return pick === "0" ? "none" : pick;
        },
      },
      // Pick, then check the pick with one yes-or-no on that sentence alone.
      // Two calls; the second sees only the chosen sentence.
      check: {
        calls: (input) => [sentenceCall(SENTENCE_SYSTEM.list, (input) => `Question: ${input.question}\n\n${numbered(input.sentences)}\n\nWhich sentence answers the question? Reply {"sentence": "<number>"} or {"sentence": "none"}.`)(input)],
        run: async (send, input) => {
          const first = ASKS.sentence.variants.check.calls(input)[0];
          const outputs = [await send(first)];
          const pick = String(parseJson(outputs[0].text).sentence);
          if (pick === "none") return { answer: "none", outputs };
          const sentence = input.sentences[Number(pick) - 1];
          if (sentence === undefined) return { answer: pick, outputs }; // out of range: the caller rejects it
          const second = {
            messages: [
              { role: "system", content: `Does the sentence state the answer to the question? Reply with JSON: {"answers": "yes"} or {"answers": "no"}.` + NO_THINK },
              { role: "user", content: `Question: ${input.question}\nSentence: ${sentence}` },
            ],
            schema: enumSchema("answers", ["yes", "no"]),
            maxTokens: 16,
          };
          outputs.push(await send(second));
          return { answer: parseJson(outputs[1].text).answers === "yes" ? pick : "none", outputs };
        },
        combine: () => { throw new Error("check runs its own steps"); },
      },
      // The floor: one yes-or-no per sentence. The answer is the set of yeses,
      // rendered as "3" when exactly one, "none" when none, "2+5" when several.
      yesno: {
        calls: (input) => input.sentences.map((sentence) => ({
          messages: [
            { role: "system", content: `Does the sentence answer the question? Reply with JSON: {"answers": "yes"} or {"answers": "no"}.` + NO_THINK },
            { role: "user", content: `Question: ${input.question}\nSentence: ${sentence}` },
          ],
          schema: enumSchema("answers", ["yes", "no"]),
          maxTokens: 16,
        })),
        combine: (outputs) => {
          const yes = outputs.map((raw, index) => (parseJson(raw).answers === "yes" ? String(index + 1) : null)).filter(Boolean);
          return yes.length ? yes.join("+") : "none";
        },
      },
    },
  },

  // ---- confirm: does this one sentence state the answer? ----
  // Input { question, sentence }. Answer: "yes" or "no". The second half of
  // the sentence ask's check variant, on its own, for when the walk decides
  // a pick needs confirming.
  confirm: {
    describe: () => "one sentence",
    variants: {
      yesno: single((input) => ({
        messages: [
          { role: "system", content: `Does the sentence state the answer to the question? Reply with JSON: {"answers": "yes"} or {"answers": "no"}.` + NO_THINK },
          { role: "user", content: `Question: ${input.question}\nSentence: ${input.sentence}` },
        ],
        schema: enumSchema("answers", ["yes", "no"]),
        maxTokens: 16,
      }), (parsed) => String(parsed.answers)),
    },
  },

  // ---- article: which of the search hits is the right article? ----
  // Input { question, titles: [string] }. Answer: one title or "none".
  // Wikipedia's first hit was "Sky blue" (the colour) for "sky blue" and
  // "North Aral Sea" for "Aral Sea shrink" (evals/results/runs, 2026-09-18);
  // the right article was in the five hits both times.
  article: {
    describe: (input) => `${input.titles.length} hits`,
    variants: {
      list: single((input) => ({
        messages: [
          { role: "system", content: `You are given a question and the titles of Wikipedia articles a search returned. Pick the title of the article most likely to answer the question. If none of them is about the question's subject, pick none. Reply with JSON only.` + NO_THINK },
          { role: "user", content: `Question: ${input.question}\n\nArticles:\n${input.titles.map((title) => `- ${title}`).join("\n")}\n\nReply {"article": "<title>"} or {"article": "none"}.` },
        ],
        schema: enumSchema("article", [...input.titles, "none"]),
        maxTokens: 80,
      }), (parsed) => String(parsed.article)),
      // With the search snippet after each title: 1.7B and 8B both chose
      // "Sky blue" (the colour) over "Diffuse sky radiation" from titles
      // alone (walk-5 benchmark). Input may carry { snippets: [string] }.
      snippets: single((input) => ({
        messages: [
          { role: "system", content: `You are given a question and Wikipedia articles a search returned, each with a line from it. Pick the title of the article most likely to answer the question. If none of them is about the question's subject, pick none. Reply with JSON only.` + NO_THINK },
          { role: "user", content: `Question: ${input.question}\n\nArticles:\n${input.titles.map((title, index) => `- ${title}${input.snippets?.[index] ? ` — ${String(input.snippets[index]).slice(0, 160)}` : ""}`).join("\n")}\n\nReply {"article": "<title>"} or {"article": "none"}.` },
        ],
        schema: enumSchema("article", [...input.titles, "none"]),
        maxTokens: 80,
      }), (parsed) => String(parsed.article)),
    },
  },

  // ---- section: which section of the article is most likely to hold the answer? ----
  // Input { question, article, sections: [string] }. Answer: one heading.
  section: {
    describe: (input) => `${input.sections.length} sections`,
    variants: {
      json: single((input) => ({
        messages: [
          { role: "system", content: `Pick the one section of the article most likely to answer the question. Reply with JSON: {"section": "<exact heading>"}.` + NO_THINK },
          { role: "user", content: JSON.stringify({ question: input.question, article: input.article, sections: input.sections }) },
        ],
        schema: enumSchema("section", input.sections),
        maxTokens: 80,
      }), (parsed) => String(parsed.section)),
      // For a brief: the section most worth reading next; "none" when the
      // rest would add nothing. Input may carry { chosen: [string] }.
      brief: single((input) => ({
        messages: [
          { role: "system", content: `You are given a brief and the section headings of a Wikipedia article. Pick the heading of the section most worth reading for the brief${input.chosen?.length ? ", other than those already chosen" : ""}. If none of the remaining sections would add anything the brief asks for, pick none. Reply with JSON only.` + NO_THINK },
          { role: "user", content: `Brief: ${input.question}\nArticle: ${input.article}${input.chosen?.length ? `\nAlready chosen: ${input.chosen.join(", ")}` : ""}\n\nSections:\n${input.sections.map((heading) => `- ${heading}`).join("\n")}\n\nReply {"section": "<heading>"} or {"section": "none"}.` },
        ],
        schema: enumSchema("section", [...input.sections, "none"]),
        maxTokens: 80,
      }), (parsed) => String(parsed.section)),
      list: single((input) => ({
        messages: [
          { role: "system", content: `You are given a question and the section headings of a Wikipedia article. Pick the heading of the section most likely to contain the answer. Reply with JSON only.` + NO_THINK },
          { role: "user", content: `Question: ${input.question}\nArticle: ${input.article}\n\nSections:\n${input.sections.map((heading) => `- ${heading}`).join("\n")}\n\nReply {"section": "<heading>"}.` },
        ],
        schema: enumSchema("section", input.sections),
        maxTokens: 80,
      }), (parsed) => String(parsed.section)),
    },
  },

  // ---- question: the decomposition. One smaller question a child could answer. ----
  // Input { question, sentences: [string] }. Answer: a question.
  question: {
    describe: (input) => `${input.sentences.length} sentences read`,
    variants: {
      one: single((input) => ({
        messages: [
          { role: "system", content: `The sentences do not answer the question. Write one smaller question whose answer would help answer it. It must ask for something the sentences do not say, and must not repeat the question. Reply with JSON: {"question": "<one question>"}.` + NO_THINK },
          { role: "user", content: `Question: ${input.question}\n\n${input.sentences.length ? numbered(input.sentences) : "(nothing read yet)"}` },
        ],
        schema: stringSchema("question", 200),
        maxTokens: 64,
      }), (parsed) => String(parsed.question).trim()),
      // Narrower phrasings: every size mostly rephrased the parent under "one"
      // (evals/node/results.md, 2026-09-18).
      part: single((input) => ({
        messages: [
          { role: "system", content: `The sentences do not answer the question. Ask about one part of it only: a single place, thing, event, cause or number that the answer would need. Do not ask the whole question again in other words. Reply with JSON: {"question": "<one short question>"}.` + NO_THINK },
          { role: "user", content: `Question: ${input.question}\n\n${input.sentences.length ? numbered(input.sentences) : "(nothing read yet)"}` },
        ],
        schema: stringSchema("question", 200),
        maxTokens: 64,
      }), (parsed) => String(parsed.question).trim()),
      first: single((input) => ({
        messages: [
          { role: "system", content: `To answer the question you would first need one fact that the sentences do not give. Ask for that fact as a short question about a specific thing. It must be a different, smaller question. Reply with JSON: {"question": "<one short question>"}.` + NO_THINK },
          { role: "user", content: `Question: ${input.question}\n\n${input.sentences.length ? numbered(input.sentences) : "(nothing read yet)"}` },
        ],
        schema: stringSchema("question", 200),
        maxTokens: 64,
      }), (parsed) => String(parsed.question).trim()),
    },
  },

  // ---- missing: the one free-text ask. What would you look up next? ----
  // Input { question, sentences: [string] } (sentences already read, possibly
  // empty). Answer: a short search phrase.
  missing: {
    describe: (input) => `${input.sentences.length} sentences read`,
    variants: {
      search: single((input) => ({
        messages: [
          { role: "system", content: `The sentences do not answer the question. Name the Wikipedia article (1 to 4 words) most likely to answer it. Reply with JSON: {"search": "<words>"}.` + NO_THINK },
          { role: "user", content: `Question: ${input.question}\n\n${input.sentences.length ? numbered(input.sentences) : "(nothing read yet)"}` },
        ],
        schema: stringSchema("search", 60),
        maxTokens: 40,
      }), (parsed) => String(parsed.search).trim()),
      // The hop, for a brief: from what was just read, the one thing worth
      // reading about next. A name to search, not a question.
      hop: single((input) => ({
        messages: [
          { role: "system", content: `You are given a brief and sentences kept for it. Name the one person, machine, place, work or event in the sentences that is most worth reading about next for the brief, as the title of its Wikipedia article (1 to 4 words)${input.subject ? `. Not ${input.subject} itself, which has been read` : ""}. Reply with JSON: {"search": "<title>"}.` + NO_THINK },
          { role: "user", content: `Brief: ${input.question}\n\n${input.sentences.length ? numbered(input.sentences) : "(nothing read yet)"}` },
        ],
        schema: stringSchema("search", 60),
        maxTokens: 40,
      }), (parsed) => String(parsed.search).trim()),
      fact: single((input) => ({
        messages: [
          { role: "system", content: `The sentences do not answer the question. In a few words, what fact is missing? Reply with JSON: {"missing": "<few words>"}.` + NO_THINK },
          { role: "user", content: `Question: ${input.question}\n\n${input.sentences.length ? numbered(input.sentences) : "(nothing read yet)"}` },
        ],
        schema: stringSchema("missing", 80),
        maxTokens: 48,
      }), (parsed) => String(parsed.missing).trim()),
    },
  },
});

export function askCalls(ask, variant, input) {
  const definition = ASKS[ask]?.variants?.[variant];
  if (!definition) throw new Error(`Unknown ask ${ask}/${variant}`);
  return definition.calls(input);
}

export function askAnswer(ask, variant, outputs, input) {
  return ASKS[ask].variants[variant].combine(outputs, input);
}
