import { Effect } from "effect";
import { tagJob } from "./quests/quest_1/tag-job";

const program = Effect.gen(function* () {
  const tags = yield* tagJob(`
Jej obecność w szpitalu czy przychodni daje poczucie bezpieczeństwa.
Dba o to, aby pacjenci byli leczeni zgodnie z najnowszymi standardami medycznymi.
  `);

  yield* Effect.sync(() => {
    console.log(tags);
  });
});

Effect.runPromise(program);
