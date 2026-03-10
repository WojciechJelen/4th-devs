import { Effect } from "effect";
import { AVAILABLE_JOB_TAGS, type JobTag } from "../../schemas";
import { tagJob } from "./tag-job";

const CURRENT_YEAR = 2026;
const OUTPUT_FILE = new URL("./results.json", import.meta.url);
const EXPECTED_HEADERS = [
  "name",
  "surname",
  "gender",
  "birthDate",
  "birthPlace",
  "birthCountry",
  "job",
] as const;

type PersonRecord = {
  [Key in (typeof EXPECTED_HEADERS)[number]]: string;
};

type FilteredPerson = PersonRecord & {
  age: number;
};

export type PersistedPerson = FilteredPerson & {
  tags?: Array<JobTag>;
};

type EnrichedPerson = FilteredPerson & {
  tags: Array<JobTag>;
};

export type PeopleAnswerRecord = {
  name: string;
  surname: string;
  gender: PersonRecord["gender"];
  born: number;
  city: string;
  tags: Array<JobTag>;
};

export type PeopleTaskPayload = {
  apikey: string;
  task: "people";
  answer: Array<PeopleAnswerRecord>;
};

const VALID_JOB_TAGS = new Set<string>(AVAILABLE_JOB_TAGS);

function getApiKey(): string {
  const apiKey = process.env.AI_DEV_API_KEY;

  if (!apiKey) {
    throw new Error("AI_DEV_API_KEY is not set");
  }

  return apiKey;
}

function getDataUrl(): string {
  return `https://hub.ag3nts.org/data/${getApiKey()}/people.csv`;
}

function parseCsvLine(line: string): Array<string> {
  const values: Array<string> = [];
  let currentValue = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      const nextCharacter = line[index + 1];

      if (insideQuotes && nextCharacter === '"') {
        currentValue += '"';
        index += 1;
        continue;
      }

      insideQuotes = !insideQuotes;
      continue;
    }

    if (character === "," && !insideQuotes) {
      values.push(currentValue.trim());
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  values.push(currentValue.trim());

  return values;
}

function parsePeopleCsv(csv: string): Array<PersonRecord> {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const headerLine = lines[0];

  if (headerLine === undefined) {
    return [];
  }

  const headers = parseCsvLine(headerLine);

  const invalidHeaders =
    headers.length !== EXPECTED_HEADERS.length ||
    headers.some((header, index) => header !== EXPECTED_HEADERS[index]);

  if (invalidHeaders) {
    throw new Error(`Unexpected CSV headers: ${headers.join(", ")}`);
  }

  const people: Array<PersonRecord> = [];

  for (const line of lines.slice(1)) {
    const columns = parseCsvLine(line);

    if (columns.length !== EXPECTED_HEADERS.length) {
      throw new Error(
        `Invalid CSV row. Expected ${EXPECTED_HEADERS.length} columns, got ${columns.length}.`
      );
    }

    const [name, surname, gender, birthDate, birthPlace, birthCountry, job] =
      columns as [string, string, string, string, string, string, string];

    people.push({
      name,
      surname,
      gender,
      birthDate,
      birthPlace,
      birthCountry,
      job,
    });
  }

  return people;
}

export function getBornYear(birthDate: string): number {
  const birthYear = Number(birthDate.split("-")[0]);

  if (!Number.isInteger(birthYear)) {
    throw new Error(`Invalid birthDate: ${birthDate}`);
  }

  return birthYear;
}

function getAgeIn2026(birthDate: string): number {
  return CURRENT_YEAR - getBornYear(birthDate);
}

function isMatchingPerson(person: FilteredPerson): boolean {
  return (
    person.gender === "M" &&
    person.age >= 20 &&
    person.age <= 40 &&
    person.birthPlace === "Grudziądz"
  );
}

function isJobTag(value: unknown): value is JobTag {
  return typeof value === "string" && VALID_JOB_TAGS.has(value);
}

function hasExpectedScalarFields(
  record: Record<string, unknown>
): record is Record<(typeof EXPECTED_HEADERS)[number] | "age", string | number> {
  return (
    EXPECTED_HEADERS.every((header) => typeof record[header] === "string") &&
    typeof record.age === "number" &&
    Number.isInteger(record.age)
  );
}

function getPersistedTags(record: Record<string, unknown>): Array<JobTag> | undefined {
  const value = record.tags ?? record.filed;

  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || !value.every(isJobTag)) {
    throw new Error("Invalid tags value");
  }

  return [...value];
}

function normalizePersistedPerson(value: unknown): PersistedPerson {
  if (typeof value !== "object" || value === null) {
    throw new Error("Person record must be an object");
  }

  const record = value as Record<string, unknown>;

  if (!hasExpectedScalarFields(record)) {
    throw new Error("Person record is missing required scalar fields");
  }

  const tags = getPersistedTags(record);

  return {
    name: record.name,
    surname: record.surname,
    gender: record.gender,
    birthDate: record.birthDate,
    birthPlace: record.birthPlace,
    birthCountry: record.birthCountry,
    job: record.job,
    age: record.age,
    ...(tags === undefined ? {} : { tags }),
  };
}

export function parseResultsJson(json: string): Array<PersistedPerson> {
  const parsed = JSON.parse(json) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("results.json must contain an array");
  }

  return parsed.map((person, index) => {
    try {
      return normalizePersistedPerson(person);
    } catch {
      throw new Error(`Invalid person record at index ${index}`);
    }
  });
}

function hasTags(person: PersistedPerson): person is EnrichedPerson {
  return Array.isArray(person.tags) && person.tags.every(isJobTag);
}

export function mapPersonToAnswerRecord(
  person: PersistedPerson
): PeopleAnswerRecord {
  if (!hasTags(person)) {
    throw new Error(`Missing tags for ${person.name} ${person.surname}`);
  }

  return {
    name: person.name,
    surname: person.surname,
    gender: person.gender,
    born: getBornYear(person.birthDate),
    city: person.birthPlace,
    tags: [...person.tags],
  };
}

function hasTransportTag(person: PeopleAnswerRecord): boolean {
  return person.tags.includes("transport");
}

export const createPeopleTaskPayload = (
  people: ReadonlyArray<PersistedPerson>
) =>
  Effect.try({
    try: (): PeopleTaskPayload => ({
      apikey: getApiKey(),
      task: "people",
      answer: people.map(mapPersonToAnswerRecord).filter(hasTransportTag),
    }),
    catch: (cause) =>
      new Error(`Formatting people task payload failed: ${String(cause)}`),
  });

function loadPeopleTaskPayloadFromResults() {
  return Effect.gen(function* () {
    const json = yield* Effect.tryPromise({
      try: () => Bun.file(OUTPUT_FILE).text(),
      catch: (cause) =>
        new Error(`Reading results.json for payload failed: ${String(cause)}`),
    });

    const people = yield* Effect.try({
      try: () => parseResultsJson(json),
      catch: (cause) =>
        new Error(
          `Parsing results.json for payload failed: ${String(cause)}`
        ),
    });

    return yield* createPeopleTaskPayload(people);
  });
}

function fetchFilteredPeople() {
  return Effect.gen(function* () {
    const dataUrl = yield* Effect.try({
      try: () => getDataUrl(),
      catch: (cause) => new Error(`Preparing request failed: ${String(cause)}`),
    });

    const response = yield* Effect.tryPromise({
      try: () => fetch(dataUrl),
      catch: (cause) => new Error(`Request failed: ${String(cause)}`),
    });

    if (!response.ok) {
      yield* Effect.fail(
        new Error(`Request failed: ${response.status} ${response.statusText}`)
      );
    }

    const csv = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (cause) => new Error(`CSV parsing failed: ${String(cause)}`),
    });

    return yield* Effect.try({
      try: () =>
        parsePeopleCsv(csv)
          .map((person): FilteredPerson => ({
            ...person,
            age: getAgeIn2026(person.birthDate),
          }))
          .filter(isMatchingPerson),
      catch: (cause) => new Error(`CSV transform failed: ${String(cause)}`),
    });
  });
}

function saveResults(
  people: ReadonlyArray<PersistedPerson>,
  errorMessage = "Saving results.json failed"
) {
  return Effect.tryPromise({
    try: () => Bun.write(OUTPUT_FILE, JSON.stringify(people, null, 2)),
    catch: (cause) => new Error(`${errorMessage}: ${String(cause)}`),
  });
}

function loadOrFetchResults() {
  return Effect.gen(function* () {
    const outputExists = yield* Effect.tryPromise({
      try: () => Bun.file(OUTPUT_FILE).exists(),
      catch: (cause) =>
        new Error(`Checking results.json failed: ${String(cause)}`),
    });

    if (outputExists) {
      const existingJson = yield* Effect.tryPromise({
        try: () => Bun.file(OUTPUT_FILE).text(),
        catch: (cause) =>
          new Error(`Reading results.json failed: ${String(cause)}`),
      });

      const existingResults = yield* Effect.try({
        try: () => parseResultsJson(existingJson),
        catch: (cause) =>
          new Error(`Parsing results.json failed: ${String(cause)}`),
      });

      yield* Effect.sync(() => {
        console.log(
          `Loaded ${existingResults.length} records from ${OUTPUT_FILE.pathname}`
        );
      });

      return existingResults;
    }

    const fetchedResults = yield* fetchFilteredPeople();

    yield* saveResults(fetchedResults);

    yield* Effect.sync(() => {
      console.log(
        `Saved ${fetchedResults.length} fetched records to ${OUTPUT_FILE.pathname}`
      );
    });

    return fetchedResults;
  });
}

export const addTagsToPeople = (
  people: ReadonlyArray<PersistedPerson>,
  tagger: typeof tagJob = tagJob
) =>
  Effect.forEach(
    people,
    (person) =>
      hasTags(person)
        ? Effect.succeed(person)
        : tagger(person.job).pipe(
            Effect.map((tags) => ({
              ...person,
              tags,
            }))
          ),
    { concurrency: 3 }
  );

export const addFiledToPeople = addTagsToPeople;

export const program = Effect.gen(function* () {
  const people = yield* loadOrFetchResults();
  const peopleWithoutTags = people.filter(
    (person) => !hasTags(person)
  ).length;
  const enrichedPeople = yield* addTagsToPeople(people);

  yield* saveResults(enrichedPeople);

  const peopleTaskPayload = yield* loadPeopleTaskPayloadFromResults();

  yield* Effect.sync(() => {
    console.log(
      `Saved ${enrichedPeople.length} records to ${OUTPUT_FILE.pathname} (${peopleWithoutTags} tagged)`
    );
    console.log("People task payload:");
    console.log(JSON.stringify(peopleTaskPayload, null, 2));
  });
});

if (import.meta.main) {
  Effect.runPromise(program);
}
