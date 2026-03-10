import { Effect, Schema } from "effect";
import { fetchOpenAI } from "../../fetch-openai";
import {
  AVAILABLE_JOB_TAGS,
  type JobTag,
  TagJobResponse,
  type OpenAIJsonSchemaFormat,
} from "../../schemas";

const TAG_JOB_MODEL = "gpt-5-nano";

const TAG_JOB_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    tags: {
      type: "array",
      description:
        "Lista dopasowanych tagów dla polskiego opisu pracy. Zwróć pustą tablicę, jeśli opis nie pasuje jednoznacznie do żadnej kategorii.",
      items: {
        type: "string",
        enum: AVAILABLE_JOB_TAGS,
        description: "Dozwolony tag z zamkniętej listy kategorii.",
      },
    },
  },
  required: ["tags"],
} as const satisfies Record<string, unknown>;

const TAG_JOB_FORMAT = {
  type: "json_schema",
  name: "job_tags",
  strict: true,
  schema: TAG_JOB_SCHEMA,
} as const satisfies OpenAIJsonSchemaFormat;

const TAG_JOB_INSTRUCTIONS = `
Przypisujesz tagi do polskich opisów zawodów i pracy.

Masz do dyspozycji wyłącznie tę listę tagów:
- IT
- transport
- edukacja
- medycyna
- praca z ludźmi
- praca z pojazdami
- praca fizyczna

Zasady odpowiedzi:
- Zawsze zwracaj JSON zgodny ze schematem, czyli obiekt z jednym polem "tags".
- "tags" zawsze musi być tablicą: [], [tag] albo [tag1, tag2, ...].
- Nigdy nie zwracaj null, undefined ani tagów spoza listy.
- Dodawaj tag tylko wtedy, gdy opis wyraźnie lub bardzo mocno sugeruje daną kategorię.
- Jeśli opis jest zbyt ogólny, dotyczy innej dziedziny albo brak pewnego dopasowania, zwróć {"tags":[]}.
- Możesz zwrócić wiele tagów, jeśli wszystkie są uzasadnione przez opis.
- Nie zgaduj i nie rozszerzaj znaczenia kategorii na siłę.

Znaczenie tagów:
- IT: oprogramowanie, aplikacje, systemy informatyczne, kod, debugowanie, infrastruktura IT, administrowanie systemami.
- transport: logistyka, spedycja, przewóz, dostawy, planowanie przepływu towarów lub osób.
- edukacja: nauczanie, dydaktyka, wychowanie, prowadzenie zajęć, praca nauczyciela lub szkoleniowca.
- medycyna: diagnozowanie, leczenie, opieka zdrowotna, pacjenci, szpital, przychodnia, badania medyczne.
- praca z ludźmi: bezpośrednia, istotna praca z innymi ludźmi, np. opieka, nauczanie, doradzanie, obsługa, prowadzenie rozmów i kontakt z osobami jako kluczowy element pracy.
- praca z pojazdami: prowadzenie, naprawa, obsługa, konserwacja lub kontrola pojazdów.
- praca fizyczna: praca manualna, budowlana, montażowa, instalacyjna lub wymagająca regularnego wysiłku fizycznego.

Dodatkowe reguły:
- Sam fakt pracy w zespole nie oznacza tagu "praca z ludźmi".
- Sam fakt używania maszyn nie oznacza tagu "praca z pojazdami".
- Badania naukowe, analiza teoretyczna lub projektowanie bez wyraźnego związku z kategoriami powyżej powinny zwykle dawać [].

Przykłady podobne do danych wejściowych:
Opis: "Specjalista ten zajmuje się analizą i rozwiązywaniem błędów w istniejących systemach. Identyfikuje potencjalne usterki i dba o stabilność aplikacji."
Wynik: {"tags":["IT"]}

Opis: "Kluczowy gracz w świecie, gdzie towary muszą docierać do celu szybko i sprawnie. Odpowiada za wybór najlepszych metod transportu i zarządzanie dokumentacją."
Wynik: {"tags":["transport"]}

Opis: "Ta profesja wymaga nie tylko wiedzy merytorycznej, ale także umiejętności pedagogicznych i psychologicznych. Pomaga kształtować charaktery i przygotowuje do wyzwań przyszłości."
Wynik: {"tags":["edukacja","praca z ludźmi"]}

Opis: "Jej obecność w szpitalu czy przychodni daje poczucie bezpieczeństwa. Dba o to, aby pacjenci byli leczeni zgodnie z najnowszymi standardami medycznymi."
Wynik: {"tags":["medycyna","praca z ludźmi"]}

Opis: "Wykonawca budowlany, którego zadaniem jest tworzenie ścian z różnych materiałów. Jego praca jest widoczna w każdym budynku."
Wynik: {"tags":["praca fizyczna"]}

Opis: "Opracowuje zasady i metody przeprowadzania badań, które pozwalają lepiej zrozumieć otaczający nas świat."
Wynik: {"tags":[]}
`;

const decodeTagJobResponse = Schema.decodeUnknownSync(TagJobResponse);

const toError = (prefix: string, cause: unknown) =>
  cause instanceof Error
    ? new Error(`${prefix}: ${cause.message}`)
    : new Error(`${prefix}: ${String(cause)}`);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const extractOutputTextFromOutputItems = (output: unknown) => {
  if (!Array.isArray(output)) {
    return undefined;
  }

  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const contentItem of item.content) {
      if (!isRecord(contentItem)) {
        continue;
      }

      if (
        contentItem.type === "output_text" &&
        typeof contentItem.text === "string" &&
        contentItem.text.trim() !== ""
      ) {
        return contentItem.text;
      }
    }
  }

  return undefined;
};

const extractRefusalFromOutputItems = (output: unknown) => {
  if (!Array.isArray(output)) {
    return undefined;
  }

  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const contentItem of item.content) {
      if (!isRecord(contentItem)) {
        continue;
      }

      if (
        contentItem.type === "refusal" &&
        typeof contentItem.refusal === "string" &&
        contentItem.refusal.trim() !== ""
      ) {
        return contentItem.refusal;
      }
    }
  }

  return undefined;
};

const extractStructuredOutputText = (rawResponseBody: string) => {
  const parsed = JSON.parse(rawResponseBody) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("OpenAI response was not a JSON object");
  }

  if (
    typeof parsed.output_text === "string" &&
    parsed.output_text.trim() !== ""
  ) {
    return parsed.output_text;
  }

  const refusal = extractRefusalFromOutputItems(parsed.output);

  if (refusal !== undefined) {
    throw new Error(`OpenAI refused the request: ${refusal}`);
  }

  const outputText = extractOutputTextFromOutputItems(parsed.output);

  if (outputText !== undefined) {
    return outputText;
  }

  throw new Error("OpenAI response did not include structured output text");
};

const normalizeTags = (tags: ReadonlyArray<JobTag>) => {
  const normalizedTags = new Set<JobTag>();

  for (const tag of tags) {
    normalizedTags.add(tag);
  }

  return AVAILABLE_JOB_TAGS.filter((tag) => normalizedTags.has(tag));
};

export const tagJob = (jobDescription: string) =>
  Effect.gen(function* () {
    const normalizedDescription = jobDescription.trim();

    if (normalizedDescription === "") {
      return [] as JobTag[];
    }

    const rawResponseBody = yield* fetchOpenAI({
      model: TAG_JOB_MODEL,
      instructions: TAG_JOB_INSTRUCTIONS,
      input: normalizedDescription,
      text: {
        format: TAG_JOB_FORMAT,
      },
    });

    const structuredOutputText = yield* Effect.try({
      try: () => extractStructuredOutputText(rawResponseBody),
      catch: (cause) =>
        toError("OpenAI structured response parsing failed", cause),
    });

    const parsedTags = yield* Effect.try({
      try: () => {
        const parsedResponse = decodeTagJobResponse(
          JSON.parse(structuredOutputText)
        );

        return normalizeTags(parsedResponse.tags);
      },
      catch: (cause) => toError("OpenAI tag parsing failed", cause),
    });

    return parsedTags;
  });
