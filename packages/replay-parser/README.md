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
src/battle-only-formes.ts   generated: mid-battle formes → what they were registered as
src/replay.ts      replays a tokenized log into battle state
src/summarize.ts   battle state + replay metadata → ParsedBattle
test/fixtures/     real replays, fetched from Showdown and stored verbatim (see below)
```

## Known limitations

**An Illusion that never drops.** `|replace|` is what reveals the Pokémon behind an
Illusion, and the borrowed name is taken back out of the bring when it arrives. A
battle that ends with the Illusion still up sends no `|replace|` at all, so the log
never says who was really on the field and the bring keeps the borrowed name. Nothing
in the protocol makes this recoverable.

**A forme newer than the generated table.** All 128 of Showdown's battle-only formes
are read back to the forme they were registered as, through `src/battle-only-formes.ts`.
That file is generated and committed, so it lags a Showdown release: a forme added since
it was last generated falls through to a `-Mega` / `-Primal` suffix rule, which is right
for a new Mega and wrong for anything else. `pnpm gen:battle-only-formes` refreshes it,
and a test fails once `@pkmn/dex` knows a forme the table does not. See ADR-0008.

## Fixtures

Real replays, fetched from Showdown and stored with their metadata intact. All of them
are public (`private: 0`, `password: null`), so neither their names nor their contents
carry a replay password — `test/package.test.ts` fails if a private one is ever added.

| Fixture                                | What it is there for                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `gen9championsvgc2026regmb-2667169457` | A ladder Bo1: Mega, a regional forme, an Illusion, and both sides holding the same Pokémon |
| `gen9championsvgc2026regmb-2667301751` | A forfeit, which the protocol only reports as free text                                    |
| `gen9ou-2667293085`                    | A tie — 100 turns of two identical stall teams                                             |
| `gen9ou-2667296078`                    | Singles, where a side has one field position                                               |
| `gen9ou-2667299955`                    | 31 turns; of 408 public Champions doubles replays scanned, none passed 20                  |
