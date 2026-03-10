import { Schema } from "effect";

export interface OpenAIJsonSchemaFormat {
  readonly type: "json_schema";
  readonly name: string;
  readonly strict: true;
  readonly schema: Record<string, unknown>;
}

export interface OpenAIRequestBody {
  readonly model: string;
  readonly input: string;
  readonly instructions?: string;
  readonly text?: {
    readonly format: OpenAIJsonSchemaFormat;
  };
}

export const AVAILABLE_JOB_TAGS = [
  "IT",
  "transport",
  "edukacja",
  "medycyna",
  "praca z ludźmi",
  "praca z pojazdami",
  "praca fizyczna",
] as const;

export const JobTag = Schema.Literals(AVAILABLE_JOB_TAGS);

export const TagJobResponse = Schema.Struct({
  tags: Schema.Array(JobTag),
});

export type JobTag = typeof JobTag.Type;
export type TagJobResponse = typeof TagJobResponse.Type;
