import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import type { JobTag } from "../../schemas";
import {
  addTagsToPeople,
  createPeopleTaskPayload,
  getBornYear,
  mapPersonToAnswerRecord,
  parseResultsJson,
  type PersistedPerson,
} from "./index";

const samplePerson: PersistedPerson = {
  name: "Jan",
  surname: "Nowak",
  gender: "M",
  birthDate: "1991-11-23",
  birthPlace: "Grudziądz",
  birthCountry: "Polska",
  job: "Kluczowy gracz w świecie, gdzie towary muszą docierać do celu szybko i sprawnie.",
  age: 35,
};

describe("quest_1 index", () => {
  test("getBornYear extracts the year from birthDate", () => {
    expect(getBornYear("1991-11-23")).toBe(1991);
  });

  test("mapPersonToAnswerRecord maps the enriched person shape", () => {
    expect(
      mapPersonToAnswerRecord({
        ...samplePerson,
        tags: ["transport"],
      })
    ).toEqual({
      name: "Jan",
      surname: "Nowak",
      gender: "M",
      born: 1991,
      city: "Grudziądz",
      tags: ["transport"],
    });
  });

  test("parseResultsJson accepts records without tags", () => {
    const parsed = parseResultsJson(JSON.stringify([samplePerson]));

    expect(parsed).toEqual([samplePerson]);
  });

  test("parseResultsJson accepts legacy filed values and normalizes them to tags", () => {
    const parsed = parseResultsJson(
      JSON.stringify([
        {
          ...samplePerson,
          filed: ["transport"],
        },
      ])
    );

    expect(parsed).toEqual([
      {
        ...samplePerson,
        tags: ["transport"],
      },
    ]);
  });

  test("parseResultsJson rejects invalid tags values", () => {
    expect(() =>
      parseResultsJson(
        JSON.stringify([
          {
            ...samplePerson,
            tags: ["not-a-real-tag"],
          },
        ])
      )
    ).toThrow("Invalid person record at index 0");
  });

  test("addTagsToPeople adds tags from the tagger result", async () => {
    const calls: Array<string> = [];

    const tagger = (jobDescription: string) =>
      Effect.sync(() => {
        calls.push(jobDescription);
        return ["transport"] as Array<JobTag>;
      });

    const enriched = await Effect.runPromise(
      addTagsToPeople([samplePerson], tagger)
    );

    expect(enriched).toEqual([
      {
        ...samplePerson,
        tags: ["transport"],
      },
    ]);
    expect(calls).toEqual([samplePerson.job]);
  });

  test("addTagsToPeople keeps existing tags values without retagging", async () => {
    const existingTaggedPerson = {
      ...samplePerson,
      tags: ["IT"],
    } satisfies PersistedPerson & { tags: Array<JobTag> };

    let taggerCalls = 0;

    const tagger = () =>
      Effect.sync(() => {
        taggerCalls += 1;
        return ["transport"] as Array<JobTag>;
      });

    const enriched = await Effect.runPromise(
      addTagsToPeople([existingTaggedPerson], tagger)
    );

    expect(enriched).toEqual([existingTaggedPerson]);
    expect(taggerCalls).toBe(0);
  });

  test("createPeopleTaskPayload keeps only people tagged with transport", async () => {
    const originalApiKey = process.env.AI_DEV_API_KEY;
    process.env.AI_DEV_API_KEY = "test-api-key";

    try {
      await expect(
        Effect.runPromise(
          createPeopleTaskPayload([
            {
              ...samplePerson,
              tags: ["transport"],
            },
            {
              ...samplePerson,
              surname: "Kowalski",
              tags: ["IT"],
            },
          ])
        )
      ).resolves.toEqual({
        apikey: "test-api-key",
        task: "people",
        answer: [
          {
            name: "Jan",
            surname: "Nowak",
            gender: "M",
            born: 1991,
            city: "Grudziądz",
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
});
