// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Combatant, TimelineEvent } from 'replay-parser'
import { rowOf } from '../utils/timelineRows'

/**
 * Whether every row the drawer can produce has words to say, in both locales.
 *
 * A row whose key no locale file carries renders as an empty line: the icon
 * and the rail with nothing beside them. It is not a crash and no other test
 * sees it, which is exactly how #120 shipped one — so the guard is the type
 * below. `SAMPLES` is a `Record` over the event kinds, so a kind added to the
 * parser without a sentence here does not compile.
 */

const scrafty: Combatant = {
  position: 'p1a',
  side: 'p1',
  nickname: 'Scrafty',
  species: 'Scrafty',
  revealedSpecies: null,
}
const whimsicott: Combatant = {
  ...scrafty,
  position: 'p2a',
  side: 'p2',
  nickname: 'Whimsicott',
  species: 'Whimsicott',
}

/** One of every event, filled in with whatever shape says the most. */
const SAMPLES: Record<TimelineEvent['kind'], TimelineEvent> = {
  switch: {
    kind: 'switch',
    how: 'switch',
    pokemon: scrafty,
    hp: 100,
    status: null,
    replaced: null,
  },
  move: { kind: 'move', actor: scrafty, move: 'Knock Off', targets: [whimsicott] },
  cant: { kind: 'cant', pokemon: scrafty, reason: 'par' },
  damage: {
    kind: 'damage',
    pokemon: scrafty,
    hpBefore: 100,
    hpAfter: 60,
    hpDelta: -40,
    from: null,
    silent: false,
  },
  heal: {
    kind: 'heal',
    pokemon: scrafty,
    hpBefore: 60,
    hpAfter: 80,
    hpDelta: 20,
    from: null,
    silent: false,
  },
  faint: { kind: 'faint', pokemon: scrafty },
  formeChange: { kind: 'formeChange', pokemon: scrafty, species: 'Palafin-Hero' },
  mega: { kind: 'mega', pokemon: scrafty, stone: 'Scraftite' },
  terastallize: { kind: 'terastallize', pokemon: scrafty, teraType: 'Fire' },
  status: { kind: 'status', pokemon: scrafty, status: 'brn' },
  cureStatus: { kind: 'cureStatus', pokemon: scrafty, status: 'brn' },
  boost: { kind: 'boost', pokemon: scrafty, stat: 'atk', stages: 2 },
  clearAllBoosts: { kind: 'clearAllBoosts' },
  clearBoosts: { kind: 'clearBoosts', pokemon: scrafty, only: null },
  setBoost: { kind: 'setBoost', pokemon: scrafty, stat: 'atk', stages: 6 },
  invertBoosts: { kind: 'invertBoosts', pokemon: scrafty },
  swapBoosts: { kind: 'swapBoosts', pokemon: scrafty, target: whimsicott, stats: ['atk'] },
  copyBoosts: { kind: 'copyBoosts', pokemon: scrafty, target: whimsicott },
  weather: { kind: 'weather', weather: 'Sandstorm', from: null },
  hitResult: { kind: 'hitResult', pokemon: scrafty, result: 'crit' },
  miss: { kind: 'miss', actor: scrafty, target: whimsicott },
  fail: { kind: 'fail', pokemon: scrafty },
  swap: { kind: 'swap', pokemon: scrafty, from: 'p1b' },
  effect: { kind: 'effect', pokemon: scrafty, effect: 'Protect', phase: 'start' },
  volatile: { kind: 'volatile', pokemon: scrafty, effect: 'Leech Seed', phase: 'start' },
  sideEffect: { kind: 'sideEffect', side: 'p1', effect: 'Tailwind', phase: 'start' },
  fieldEffect: {
    kind: 'fieldEffect',
    effect: 'Trick Room',
    phase: 'start',
    from: null,
    source: null,
  },
  endItem: { kind: 'endItem', pokemon: scrafty, item: 'Sitrus Berry' },
  ability: { kind: 'ability', pokemon: scrafty, ability: 'Intimidate' },
  endAbility: { kind: 'endAbility', pokemon: scrafty, ability: 'Intimidate' },
  mustRecharge: { kind: 'mustRecharge', pokemon: scrafty },
  unknown: { kind: 'unknown', raw: '|upkeep' },
}

/**
 * The variants of a kind whose key depends on a field rather than on the kind:
 * a phase, a sign, whether the line named any stats.
 */
const VARIANTS: TimelineEvent[] = [
  { kind: 'switch', how: 'switch', pokemon: scrafty, hp: 100, status: null, replaced: whimsicott },
  { kind: 'switch', how: 'replace', pokemon: scrafty, hp: 100, status: null, replaced: whimsicott },
  { kind: 'boost', pokemon: scrafty, stat: 'atk', stages: -1 },
  { kind: 'clearBoosts', pokemon: scrafty, only: 'positive' },
  { kind: 'swapBoosts', pokemon: scrafty, target: whimsicott, stats: [] },
  { kind: 'weather', weather: 'none', from: null },
  { kind: 'effect', pokemon: scrafty, effect: 'Protect', phase: 'activate' },
  { kind: 'volatile', pokemon: scrafty, effect: 'Leech Seed', phase: 'end' },
  { kind: 'sideEffect', side: 'p1', effect: 'Tailwind', phase: 'end' },
  { kind: 'fieldEffect', effect: 'Trick Room', phase: 'end', from: null, source: null },
  { kind: 'hitResult', pokemon: scrafty, result: 'immune' },
]

/**
 * The locale files as they are written, read off disk rather than imported:
 * the i18n plugin compiles an import of one into message ASTs, and a sentence
 * is no longer a string by the time it arrives.
 */
const LOCALES = Object.fromEntries(
  ['en', 'zh-TW'].map((locale) => [
    locale,
    JSON.parse(
      readFileSync(
        fileURLToPath(new URL(`../../../../i18n/locales/${locale}.json`, import.meta.url)),
        'utf8',
      ),
    ) as { battle: { event: object } },
  ]),
)

/** The sentence a locale file has under `battle.event`, or undefined. */
function sentence(locale: string, key: string): string | undefined {
  const said = key
    .split('.')
    .reduce<unknown>(
      (node, step) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[step] : undefined,
      LOCALES[locale]?.battle.event,
    )

  return typeof said === 'string' ? said : undefined
}

const said = [...Object.values(SAMPLES), ...VARIANTS].flatMap((event) => {
  const row = rowOf(event)
  if (!row?.message) return []

  return [{ kind: event.kind, message: row.message }]
})

describe('the words a row says', () => {
  for (const locale of Object.keys(LOCALES)) {
    it(`has a sentence in ${locale} for every row that carries a message`, () => {
      const wordless = said
        .filter(({ message }) => sentence(locale, message.key) === undefined)
        .map(({ kind, message }) => `${kind} → ${message.key}`)

      expect(wordless, 'this row would draw an icon and no words').toEqual([])
    })

    it(`fills in every parameter its ${locale} sentence asks for`, () => {
      // `pokemon` and `into` are the row's own subject and whatever it points
      // at; EventRow passes both on every row (ADR-0014).
      const unfilled = said.flatMap(({ kind, message }) => {
        const given = new Set([...Object.keys(message.params ?? {}), 'pokemon', 'into'])
        const asked = [...(sentence(locale, message.key) ?? '').matchAll(/\{(\w+)\}/g)]

        return asked
          .filter((match) => !given.has(match[1]!))
          .map((match) => `${kind} → ${message.key}: {${match[1]}}`)
      })

      expect(unfilled, 'this parameter would render as a literal brace').toEqual([])
    })
  }
})
