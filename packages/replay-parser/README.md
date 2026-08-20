# replay-parser

Parses Showdown replay logs, two ways:

```ts
parseReplay(log: string, meta: ReplayMeta): ParsedBattle
parseTimeline(log: string): BattleTimeline
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
src/timeline.ts    the same log as a flat, per-turn event stream for display
src/version.ts     PARSER_VERSION, stored on every row this parser produced
test/fixtures/     real replays, fetched from Showdown and stored verbatim (see below)
```

## The hard points

Every hard point in §6 of the design document is pinned by a named test in
`test/parse-replay.test.ts`. The test names below are abbreviated where the full name
would not fit; each is a prefix of the real one.

| #   | Hard point                                   | Test                                                                                                                                       |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Mega evolution changes the species           | _reduces a Mega forme to its base species in the bring signature_                                                                          |
| 2   | `\|switch\|` is not the only way to appear   | _counts a Pokémon dragged out against its trainer into the bring_                                                                          |
| 3   | Identity is compared through `toID()`        | _normalises each side name into a user id_, _leaves the winning side unresolved when the `\|win\|` name matches neither player_            |
| 4   | A Bo3 replay is one game of a series         | _takes the series id of a Bo3 game from the `\|uhtml\|bestof\|` link to its parent_                                                        |
| 5   | The metadata rating belongs to neither side  | _never takes a rating from the replay metadata_, _reads each side rating from its own `\|player\|` line and its own `\|raw\|` line_        |
| 6   | `\|player\|` is re-sent, empty, at the end   | _takes each side name from the first `\|player\|` line_                                                                                    |
| 7   | Forfeiting has no message type of its own    | _reads a forfeit off the free-text message Showdown sends before the win_                                                                  |
| 8   | `\|-mega\|` is a cross-check, not the source | _reduces a Primal forme to its base species without a `\|-mega\|` line to lean on_                                                         |
| 9   | Species Clause is per side                   | _collects the team of each side separately_                                                                                                |
| 10  | Not everything picked appears                | _marks the bring complete only when as many Pokémon appeared as the team size says were picked_                                            |
| 11  | The game type is not hardcoded               | _reads a singles game and a doubles game through the same path_, _records a game type it has never heard of rather than dropping the game_ |

## Ratings

A replay's metadata carries a `rating`, and it belongs to neither side: measured on
`gen9championsvgc2026regmb-2667169457`, that field is 1429, which is the **loser's**
post-battle rating. Writing it to a row would draw the winner's rating curve out of
their opponent's numbers, so the parser never reads it.

Each side's rating comes from its own lines instead: `ratingBefore` from the 5th column
of that side's `|player|` line, `ratingAfter` and `ratingDelta` from the `|raw|` line
Showdown sends once the battle is over. Each is null on its own terms: a game with no
`|rated|` line carries no rating at all, while a laddered Bo3 game may report a rating
going in and none coming out. A null is left as a null, because a rating curve is meant
to break where no ladder was played rather than interpolate one.

## Series

A Bo3 replay is a single game. The `|uhtml|bestof|` line links to the parent battle the
games of a series share, and its room id is kept as `seriesId`. Games are always the unit
of storage; a series result is derived from the games that carry the same id.

## The timeline

`parseTimeline` answers a different question from `parseReplay`: not _whose team was
this and who won_, but _what happened on screen_. The two are deliberately independent —
`parseReplay` runs once per battle at import time, `parseTimeline` runs when somebody
opens a battle to read it — so neither pays for the other's work, and the timeline is
never stored. See CONTEXT.md for how the two differ on formes and Illusion.

What the protocol makes awkward, and how this file handles it:

- **`|-damage|` reports what is left, not what was lost.** The running HP of each field
  position is tracked so an event can carry the drop it caused. HP fields are not plain
  numbers either: `93/100 brn`, `0 fnt` and one measured `50/100g` all appear, so only
  the digits before the slash are read.
- **Most lines carry only a nickname.** `|-damage|p2a: nothing new there|38/100` names
  nobody recognisable; the species comes from the latest appearance at that position.
  Both are kept, since a trainer's own nicknames are often the easier of the two to read.
- **A forme change makes a new combatant.** Events from before a Mega keep showing the
  forme that was on the field when they happened.
- **`|replace|` tells every event at that position who it really was**, without rewriting
  the name it was wearing. The lie is what the opponent played against, and erasing it
  would erase the battle.
- **What is read is what Showdown shows.** The list of structured line types was widened
  after a fresh ladder replay was run through it: Protect activating, a screen going up,
  a berry being eaten and an ability triggering are all on screen in Showdown, and a
  timeline without them shows moves that appear to do nothing at all.
- **Unread line types are kept** as `{ kind: 'unknown', raw }`, rebuilt from the tokens —
  so a legacy untyped line comes back with a leading `||`, which is the one thing `raw`
  does not reproduce exactly. Showdown's
  protocol is far larger than what is read here, and a turn that quietly went empty
  would be untraceable. Only the bare `|` spacer and `[silent]` lines are dropped —
  Showdown does not show those either.
- **The timeline starts at `|start|`.** Players, rules and team preview belong to
  `ParsedBattle`; a `|t:|` before `|start|` is therefore not read, and the opening turn
  of such a log has no `startedAt`.
- **An Ally Switch moves everything with the Pokémon.** `|swap|` trades the two
  positions' occupants, their running HP, and their pending Illusion reveal.
- **A truncated log yields the turns that parsed.** Nothing throws: the battle itself
  was already recorded at import time, and half a timeline still reads.

## No KO attribution

Neither output says who knocked out what. `|faint|` does not name a culprit — the cause
may be recoil, Life Orb, Rough Skin, weather or status — so attribution is left out until
a view needs it, at which point a re-parse can add it from the stored logs.

The timeline does not sneak it back in either. `|-damage|` carries a `[from]` for burn,
items and abilities, but never for move damage, so a damage event is only ever attributed
to what the log itself named. Reading it off the nearest `|move|` would be a guess that
breaks on spread moves, recoil and anything else that lands between the two lines.

## Known limitations

**An Illusion that never drops.** `|replace|` is what reveals the Pokémon behind an
Illusion, and the borrowed name is taken back out of the bring when it arrives. A
battle that ends with the Illusion still up sends no `|replace|` at all, so the log
never says who was really on the field and the bring keeps the borrowed name. Nothing
in the protocol makes this recoverable.

**An Illusion that switches out and back.** `|replace|` tells the events at that position
who they really were, but only back to the current arrival. A Zoroark that leaves the
field under its disguise and returns before the illusion breaks leaves its earlier stint
unlabelled — the alternative, matching by the borrowed name, would mislabel a real
Pokémon of that name that had stood there, which is the worse error.

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

| Fixture                                   | What it is there for                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `gen9championsvgc2026regmb-2667169457`    | A ladder Bo1: Mega, a regional forme, an Illusion, and both sides holding the same Pokémon |
| `gen9championsvgc2026regmb-2667301751`    | A forfeit, which the protocol only reports as free text                                    |
| `gen9ou-2667293085`                       | A tie — 100 turns of two identical stall teams                                             |
| `gen9ou-2667296078`                       | Singles, where a side has one field position                                               |
| `gen9ou-2667299955`                       | 31 turns; of 408 public Champions doubles replays scanned, none passed 20                  |
| `gen9championsvgc2026regmbbo3-2667579302` | A Bo3 game with no rating anywhere, and open team sheets                                   |
| `gen9championsvgc2026regmbbo3-2667582547` | Game 2 of a Bo3: a ladder rating going in, none coming out                                 |
