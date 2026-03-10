import { Effect } from "effect";

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

function getDataUrl(): string {
  const apiKey = process.env.AI_DEV_API_KEY;

  if (!apiKey) {
    throw new Error("AI_DEV_API_KEY is not set");
  }

  return `https://hub.ag3nts.org/data/${apiKey}/people.csv`;
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

function getAgeIn2026(birthDate: string): number {
  const birthYear = Number(birthDate.split("-")[0]);

  if (!Number.isInteger(birthYear)) {
    throw new Error(`Invalid birthDate: ${birthDate}`);
  }

  return CURRENT_YEAR - birthYear;
}

function isMatchingPerson(person: FilteredPerson): boolean {
  return (
    person.gender === "M" &&
    person.age >= 20 &&
    person.age <= 40 &&
    person.birthPlace === "Grudziądz"
  );
}

const program = Effect.gen(function* () {
  const outputExists = yield* Effect.tryPromise({
    try: () => Bun.file(OUTPUT_FILE).exists(),
    catch: (cause) => new Error(`Checking results.json failed: ${String(cause)}`),
  });

  if (outputExists) {
    yield* Effect.sync(() => {
      console.log(`Skipping fetch, ${OUTPUT_FILE.pathname} already exists`);
    });

    return;
  }

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

  const filteredPeople = yield* Effect.try({
    try: () =>
      parsePeopleCsv(csv)
        .map((person): FilteredPerson => ({
          ...person,
          age: getAgeIn2026(person.birthDate),
        }))
        .filter(isMatchingPerson),
    catch: (cause) => new Error(`CSV transform failed: ${String(cause)}`),
  });

  yield* Effect.tryPromise({
    try: () => Bun.write(OUTPUT_FILE, JSON.stringify(filteredPeople, null, 2)),
    catch: (cause) => new Error(`Saving results.json failed: ${String(cause)}`),
  });

  yield* Effect.sync(() => {
    console.log(
      `Saved ${filteredPeople.length} records to ${OUTPUT_FILE.pathname}`
    );
  });
});

Effect.runPromise(program);
