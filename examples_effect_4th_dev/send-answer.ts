import { Effect } from "effect";

export const AG3NTS_VERIFY_URL = "https://hub.ag3nts.org/verify";
const AI_DEV_API_KEY_ENV = "AI_DEV_API_KEY";

export interface SendAnswerPayload {
  readonly apikey: string;
  readonly task: string;
  readonly answer: any;
}

export interface SendAnswerConfig {
  readonly task: string;
  readonly answer: any;
}

type FetchImplementation = typeof fetch;

function getApiKey(): string {
  const resolvedApiKey = process.env[AI_DEV_API_KEY_ENV];

  if (!resolvedApiKey) {
    throw new Error(`${AI_DEV_API_KEY_ENV} is not set`);
  }

  return resolvedApiKey;
}

export function createSendAnswerPayload(
  config: SendAnswerConfig
): SendAnswerPayload {
  return {
    apikey: getApiKey(),
    task: config.task,
    answer: config.answer,
  };
}

async function parseVerifyResponse(response: Response): Promise<unknown> {
  const body = await response.text();

  if (body.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

const formatErrorDetail = (responseBody: unknown) => {
  if (responseBody === null) {
    return "";
  }

  if (typeof responseBody === "string") {
    return `: ${responseBody}`;
  }

  return `: ${JSON.stringify(responseBody)}`;
};

export const sendAnswer = (
  config: SendAnswerConfig,
  fetchImplementation: FetchImplementation = fetch
) =>
  Effect.gen(function* () {
    const payload = yield* Effect.try({
      try: () => createSendAnswerPayload(config),
      catch: (cause) =>
        new Error(`Preparing answer payload failed: ${String(cause)}`),
    });

    const response = yield* Effect.tryPromise({
      try: () =>
        fetchImplementation(AG3NTS_VERIFY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }),
      catch: (cause) => new Error(`Sending answer failed: ${String(cause)}`),
    });

    const responseBody = yield* Effect.tryPromise({
      try: () => parseVerifyResponse(response),
      catch: (cause) =>
        new Error(`Reading verify response failed: ${String(cause)}`),
    });

    if (!response.ok) {
      yield* Effect.fail(
        new Error(
          `Sending answer failed: ${response.status} ${response.statusText}${formatErrorDetail(
            responseBody
          )}`
        )
      );
    }

    return responseBody;
  });
