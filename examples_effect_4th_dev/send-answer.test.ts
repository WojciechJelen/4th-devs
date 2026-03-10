import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  AG3NTS_VERIFY_URL,
  createSendAnswerPayload,
  sendAnswer,
} from "./send-answer";

describe("send-answer", () => {
  test("createSendAnswerPayload uses AI_DEV_API_KEY from the environment", () => {
    const originalApiKey = process.env.AI_DEV_API_KEY;
    process.env.AI_DEV_API_KEY = "test-api-key";

    try {
      expect(
        createSendAnswerPayload({
          task: "people",
          answer: [
            {
              name: "Jan",
              surname: "Kowalski",
              gender: "M",
              born: 1987,
              city: "Warszawa",
              tags: ["transport"],
            },
          ],
        })
      ).toEqual({
        apikey: "test-api-key",
        task: "people",
        answer: [
          {
            name: "Jan",
            surname: "Kowalski",
            gender: "M",
            born: 1987,
            city: "Warszawa",
            tags: ["transport"],
          },
        ],
      });
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.AI_DEV_API_KEY;
      } else {
        process.env.AI_DEV_API_KEY = originalApiKey;
      }
    }
  });

  test("sendAnswer posts the expected payload to the verify endpoint", async () => {
    const originalApiKey = process.env.AI_DEV_API_KEY;
    process.env.AI_DEV_API_KEY = "test-api-key";
    const requests: Array<{ url: string; init?: RequestInit }> = [];

    const fetchImplementation: typeof fetch = async (input, init) => {
      requests.push({
        url: typeof input === "string" ? input : input.toString(),
        init,
      });

      return new Response(JSON.stringify({ code: 0, message: "OK" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    };

    try {
      await expect(
        Effect.runPromise(
          sendAnswer(
            {
              task: "people",
              answer: [
                {
                  name: "Anna",
                  surname: "Nowak",
                  gender: "F",
                  born: 1993,
                  city: "Grudziądz",
                  tags: ["tagA", "tagB"],
                },
              ],
            },
            fetchImplementation
          )
        )
      ).resolves.toEqual({
        code: 0,
        message: "OK",
      });

      expect(requests).toHaveLength(1);

      const [request] = requests;
      expect(request).toBeDefined();
      expect(request?.url).toBe(AG3NTS_VERIFY_URL);
      expect(request?.init?.method).toBe("POST");
      expect(request?.init?.headers).toEqual({
        "Content-Type": "application/json",
      });
      expect(request?.init?.body).toBe(
        JSON.stringify({
          apikey: "test-api-key",
          task: "people",
          answer: [
            {
              name: "Anna",
              surname: "Nowak",
              gender: "F",
              born: 1993,
              city: "Grudziądz",
              tags: ["tagA", "tagB"],
            },
          ],
        })
      );
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.AI_DEV_API_KEY;
      } else {
        process.env.AI_DEV_API_KEY = originalApiKey;
      }
    }
  });
});
