# replay-parser

Parses Showdown replay logs into a perspective-neutral `ParsedBattle`:

```ts
parseReplay(log: string, meta: ReplayMeta): ParsedBattle
```

`ParsedBattle` describes p1 and p2 alike and does not know which of them is "me" —
that is resolved when the battle is written to the database, so one parse can be
reused by any user.

This package must stay a pure function: **no Supabase, no Nuxt, no `fetch`, no I/O of
any kind**, and an empty `dependencies` list. Its testability rests entirely on that.

```
src/protocol.ts    line-level tokenizer for the Showdown protocol
src/species.ts     identity normalisation and base species
src/replay.ts      replays a tokenized log into battle state
src/summarize.ts   battle state + replay metadata → ParsedBattle
test/fixtures/     real replays, fetched from Showdown and stored verbatim
```

## Known limitation

A Pokémon that switches in under Illusion is recorded in the bring under the name it
was wearing, and the `|replace|` line that reveals it adds the real one. The bring is
therefore right only when the Pokémon whose name was borrowed also appears for real —
which it does in the fixture. Correcting the false entry needs the parser to know which
appearance the Illusion covered, and is left for the forme and edge-case work in #5.

Fixtures are public replays (`private: 0`), so neither their names nor their contents
carry a replay password.
