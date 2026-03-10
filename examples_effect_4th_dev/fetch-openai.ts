import { Effect } from "effect";
import type { OpenAIRequestBody } from "./schemas";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export const fetchOpenAI = (payload: OpenAIRequestBody) =>
  Effect.gen(function* () {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      yield* Effect.fail(new Error("OPENAI_API_KEY is not set"));
    }

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(OPENAI_RESPONSES_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
        }),
      catch: (cause) => new Error(`OpenAI request failed: ${String(cause)}`),
    });

    const body = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (cause) =>
        new Error(`OpenAI response parsing failed: ${String(cause)}`),
    });

    if (!response.ok) {
      yield* Effect.fail(
        new Error(
          `OpenAI request failed: ${response.status} ${response.statusText}`
        )
      );
    }

    return body;
  });
