import { test } from "node:test";
import assert from "node:assert/strict";
import { ASKS, askAnswer, askCalls, parseJson, splitSentences } from "../src/asks.js";

test("splitSentences: one sentence per choice, no fragments, abbreviations kept together", () => {
  const text = "The Dead Sea is a salt lake. It lies in the Jordan Rift Valley, c. 430 m below sea level. Its main tributary is the Jordan River! Is it shrinking? Yes.";
  assert.deepEqual(splitSentences(text), [
    "The Dead Sea is a salt lake.",
    "It lies in the Jordan Rift Valley, c. 430 m below sea level.",
    "Its main tributary is the Jordan River! Is it shrinking? Yes.",
  ], "short fragments join their neighbour rather than becoming choices");
  assert.deepEqual(splitSentences("  "), []);
  assert.deepEqual(splitSentences("Line one\n\nline two. Then (a note about the lake) follows here."), ["Line one line two.", "Then (a note about the lake) follows here."]);
});

test("every ask variant builds calls with a tiny schema and reads the answer back", () => {
  const input = { question: "Why?", sentences: ["Because A.", "Because B."], article: "X", sections: ["One", "Two"], titles: ["X", "Y"], sentence: "Because A." };
  for (const [name, ask] of Object.entries(ASKS)) {
    for (const [variant, definition] of Object.entries(ask.variants)) {
      const calls = definition.calls(input);
      assert.ok(calls.length >= 1, `${name}/${variant} builds a call`);
      for (const call of calls) {
        assert.equal(call.messages[0].role, "system");
        assert.match(call.messages[0].content, /\/no_think$/);
        assert.equal(call.schema.type, "object");
        assert.equal(call.schema.additionalProperties, false);
        assert.equal(Object.keys(call.schema.properties).length, 1, `${name}/${variant} asks for one field`);
        assert.ok(call.maxTokens <= 80);
      }
    }
  }
  assert.equal(askCalls("sentence", "json", input)[0].schema.properties.sentence.enum.join(","), "1,2,none");
  assert.equal(askAnswer("sentence", "json", ['{"sentence": "2"}'], input), "2");
  assert.equal(askAnswer("sentence", "list", ['\n{"sentence":"none"}\n'], input), "none");
  assert.equal(askCalls("sentence", "yesno", input).length, 2);
  assert.equal(askAnswer("sentence", "yesno", ['{"answers":"no"}', '{"answers":"yes"}'], input), "2");
  assert.equal(askAnswer("sentence", "yesno", ['{"answers":"yes"}', '{"answers":"yes"}'], input), "1+2");
  assert.equal(askAnswer("sentence", "yesno", ['{"answers":"no"}', '{"answers":"no"}'], input), "none");
  assert.equal(askAnswer("sentence", "zero", ['{"sentence":"0"}'], input), "none");
  assert.equal(askAnswer("sentence", "zero", ['{"sentence":"2"}'], input), "2");
  assert.deepEqual(askCalls("section", "json", input)[0].schema.properties.section.enum, ["One", "Two"]);
  assert.equal(askAnswer("missing", "search", ['{"search": " Dead Sea "}'], input), "Dead Sea");
  assert.throws(() => askCalls("sentence", "nope", input), /Unknown ask/);
});

test("the check variant asks once more about the chosen sentence and returns none when it says no", async () => {
  const input = { question: "Why?", sentences: ["Because A.", "Because B."] };
  const seen = [];
  const send = async (call) => {
    seen.push(call);
    return { text: seen.length === 1 ? '{"sentence":"2"}' : '{"answers":"no"}' };
  };
  const result = await ASKS.sentence.variants.check.run(send, input);
  assert.equal(result.answer, "none");
  assert.equal(seen.length, 2);
  assert.match(seen[1].messages[1].content, /Sentence: Because B\./);
  const quick = await ASKS.sentence.variants.check.run(async () => ({ text: '{"sentence":"none"}' }), input);
  assert.equal(quick.answer, "none");
});

test("parseJson tolerates text around the object and rejects garbage", () => {
  assert.deepEqual(parseJson('Sure: {"a": 1} done'), { a: 1 });
  assert.throws(() => parseJson("not json"));
});

test("isParaphrase: a child that keeps every content word of its parent is the parent again", async () => {
  const { isParaphrase } = await import("../src/text.js");
  assert.equal(isParaphrase("What causes the Dead Sea to shrink?", "Why is the Dead Sea shrinking?"), true);
  assert.equal(isParaphrase("What is the reason behind the Dead Sea's shrinking?", "Why is the Dead Sea shrinking?"), true);
  assert.equal(isParaphrase("What is the source of the water that is being removed from the Dead Sea?", "Why is the Dead Sea shrinking?"), false);
  assert.equal(isParaphrase("What causes the energy exchanges that drive the water cycle?", "Why does the water cycle keep going?"), false);
  assert.equal(isParaphrase("What causes coral reefs to bleach?", "Why do coral reefs bleach?"), true);
});
