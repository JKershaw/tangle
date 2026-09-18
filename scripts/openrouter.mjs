// A reference model over OpenRouter for the node evals: the same call (messages
// and JSON schema) a page model gets, answered by a large cheap model. It is not
// part of the page. If the big model fails a case, the case or the ask is wrong;
// if it passes where a small model fails, that is a capacity gap. Needs
// OPENROUTER_API_KEY in the environment.
export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export function openRouterModel(id) {
  return id.startsWith("openrouter:") ? id.slice("openrouter:".length) : null;
}

export async function askOpenRouter(model, call, { apiKey = process.env.OPENROUTER_API_KEY, temperature = 0, fetchImpl = globalThis.fetch } = {}) {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  const started = performance.now();
  const response = await fetchImpl(OPENROUTER_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "HTTP-Referer": "https://github.com/JKershaw/tangle", "X-Title": "Tangle node evals" },
    body: JSON.stringify({
      model,
      messages: call.messages,
      temperature,
      max_tokens: Math.max(call.maxTokens ?? 64, 64),
      response_format: { type: "json_schema", json_schema: { name: "answer", strict: true, schema: call.schema } },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${body?.error?.message ?? JSON.stringify(body).slice(0, 200)}`);
  const text = body.choices?.[0]?.message?.content ?? "";
  return { text, tokens: body.usage?.total_tokens ?? null, latencyMs: Math.round(performance.now() - started) };
}
