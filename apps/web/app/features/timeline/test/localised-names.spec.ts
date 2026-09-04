import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import EventRow from '../components/EventRow.vue'
import FieldBar from '../components/FieldBar.vue'
import type { FieldSnapshot } from '../utils/battleField'
import type { TimelineRow } from '../utils/timelineRows'

/**
 * Which name the timeline puts a Pokémon and a move under, per locale, and what
 * is left of the English one. See docs/adr/0014-localised-species-names.md and
 * docs/adr/0015-localised-move-names.md.
 *
 * The `en` cases are the point of the file as much as the `zh-TW` ones: the
 * English screen is not supposed to have moved at all (#101, #102).
 */

const row: TimelineRow = {
  mark: 'switch',
  side: 'p1',
  species: 'Ninetales-Alola',
  move: null,
  targets: [{ species: 'Pikachu', notes: [], health: [] }],
  bystanders: [],
  notes: [],
  message: { key: 'cameInFor' },
  quiet: false,
  health: null,
  status: null,
  tone: null,
}

const snapshot: FieldSnapshot = {
  turn: 1,
  slots: [
    {
      side: 'p1',
      position: 'p1a',
      species: 'Ninetales-Alola',
      hp: 100,
      status: null,
      boosts: {},
      volatiles: [],
      teraType: null,
      fainted: false,
    },
  ],
  offField: [],
  screens: { p1: [], p2: [] },
  fieldEffects: [],
  weather: null,
  fieldAbilities: [],
}

/**
 * The locale comes off the route: `prefix_except_default` puts zh-TW behind
 * /zh-TW (ADR-0006), which is the whole of what these components read.
 */
const routeFor = (locale: string) => (locale === 'en' ? '/' : `/${locale}/`)

async function mountRow(locale: string) {
  return await mountSuspended(EventRow, {
    props: { row, mySide: 'p1' as const },
    route: routeFor(locale),
  })
}

async function mountField(locale: string) {
  return await mountSuspended(FieldBar, {
    props: { snapshot, mySide: 'p1' as const, caption: 'Turn 1' },
    route: routeFor(locale),
  })
}

describe('the timeline in en', () => {
  it('is unchanged: English in the message and on the icons', async () => {
    const wrapper = await mountRow('en')

    expect(wrapper.text()).toContain('Pikachu came in for Ninetales-Alola')
    expect(wrapper.findAll('[title]').map((icon) => icon.attributes('title'))).toEqual([
      'Ninetales-Alola',
      'Pikachu',
    ])
  })

  it('names the field bar icons in English, with nothing appended', async () => {
    const wrapper = await mountField('en')
    const icon = wrapper.get('[title]')

    expect(icon.attributes('title')).toBe('Ninetales-Alola')
    expect(icon.attributes('aria-label')).toBe('Ninetales-Alola')
  })
})

describe('the timeline in zh-TW', () => {
  it('says the message with the official Chinese names', async () => {
    const wrapper = await mountRow('zh-TW')

    expect(wrapper.text()).toContain('九尾（阿羅拉的樣子） 換成 皮卡丘')
  })

  it('keeps the English name on the icon, where Showdown can be compared', async () => {
    const wrapper = await mountRow('zh-TW')

    expect(wrapper.findAll('[title]').map((icon) => icon.attributes('title'))).toEqual([
      '九尾（阿羅拉的樣子） · Ninetales-Alola',
      '皮卡丘 · Pikachu',
    ])
  })

  it('names the field bar icons in Chinese, English still attached', async () => {
    const wrapper = await mountField('zh-TW')
    const icon = wrapper.get('[title]')

    expect(icon.attributes('title')).toBe('九尾（阿羅拉的樣子） · Ninetales-Alola')
    expect(icon.attributes('aria-label')).toBe('九尾（阿羅拉的樣子） · Ninetales-Alola')
  })

  it('shows the forme it was in, not its base species', async () => {
    // The timeline is the one path that does not undo battle formes
    // (CONTEXT.md, ADR-0008), and the localised table is keyed the same way, so
    // Alolan Ninetales must not come back as plain 九尾.
    const wrapper = await mountField('zh-TW')

    expect(wrapper.get('[title]').attributes('title')).not.toBe('九尾 · Ninetales')
  })
})

/**
 * A move's own name, plus the two effect strings that are themselves move
 * names: the note beside a Pokémon that was blocked, and the side condition
 * that went up.
 */
const moveRow: TimelineRow = {
  mark: 'move',
  side: 'p1',
  species: 'Pikachu',
  move: 'Wide Guard',
  targets: [
    {
      species: 'Ninetales-Alola',
      notes: [{ key: 'effectHeld', params: { effect: 'Protect' }, quiet: false }],
      health: [],
    },
  ],
  bystanders: [],
  notes: [{ key: 'effectStarted', params: { effect: 'Wide Guard' }, quiet: false }],
  message: null,
  quiet: false,
  health: null,
  status: null,
  tone: null,
}

const sideEffectRow: TimelineRow = {
  ...moveRow,
  mark: 'none',
  species: null,
  move: null,
  targets: [],
  notes: [],
  message: { key: 'sideEffectStarted', params: { effect: 'Stealth Rock' } },
}

/** A move in the dex the zh-Hant table has no name for. */
const untranslatedRow: TimelineRow = { ...moveRow, move: 'Nihil Light', notes: [], targets: [] }

async function mountRowOf(row: TimelineRow, locale: string) {
  return await mountSuspended(EventRow, {
    props: { row, mySide: 'p1' as const },
    route: routeFor(locale),
  })
}

describe('a move on the timeline in en', () => {
  it('is unchanged: the English name on the row and in its notes', async () => {
    const wrapper = await mountRowOf(moveRow, 'en')

    expect(wrapper.text()).toContain('Wide Guard')
    expect(wrapper.findAll('[data-testid="row-note"]').map((note) => note.text())).toEqual([
      'Wide Guard',
      'Protect held',
    ])
  })

  it('is unchanged on a side condition going up', async () => {
    const wrapper = await mountRowOf(sideEffectRow, 'en')

    expect(wrapper.text()).toContain('Stealth Rock up')
  })
})

describe('a move on the timeline in zh-TW', () => {
  it('says the move under its official Chinese name', async () => {
    const wrapper = await mountRowOf(moveRow, 'zh-TW')

    expect(wrapper.text()).toContain('廣域防守')
    expect(wrapper.text()).not.toContain('Wide Guard')
  })

  it('says the effect strings that are move names in Chinese too', async () => {
    const wrapper = await mountRowOf(moveRow, 'zh-TW')

    expect(wrapper.findAll('[data-testid="row-note"]').map((note) => note.text())).toEqual([
      '廣域防守',
      '被 守住 擋下',
    ])
  })

  it('says a side condition going up in Chinese', async () => {
    const wrapper = await mountRowOf(sideEffectRow, 'zh-TW')

    expect(wrapper.text()).toContain('隱形岩 展開')
  })

  it('leaves a move the table has not reached in English', async () => {
    // A blank or a guess would both be worse than the name Showdown shows.
    const wrapper = await mountRowOf(untranslatedRow, 'zh-TW')

    expect(wrapper.text()).toContain('Nihil Light')
  })
})

/**
 * The rest of the battle vocabulary on the rows and the chips that draw it:
 * the ability row, the lost-item row, the weather, the field, a stat change, a
 * Tera type, and the `[from]` on a damage row.
 *
 * The `en` cases pin the English screen in place, the same way the two blocks
 * above pin it for #101 and #102 (docs/adr/0016-localised-battle-vocabulary.md).
 */

const abilityRow: TimelineRow = {
  ...moveRow,
  mark: 'none',
  move: null,
  targets: [],
  bystanders: [],
  notes: [],
  message: { key: 'ability', params: { ability: 'Regenerator' } },
}

const lostItemRow: TimelineRow = {
  ...abilityRow,
  message: { key: 'lostItem', params: { item: 'Life Orb' } },
}

const weatherRow: TimelineRow = {
  ...abilityRow,
  species: null,
  message: { key: 'weather', params: { weather: 'Snowscape' } },
}

const weatherClearedRow: TimelineRow = {
  ...weatherRow,
  message: { key: 'weatherCleared' },
}

const fieldEffectRow: TimelineRow = {
  ...abilityRow,
  message: { key: 'fieldEffectStarted', params: { effect: 'Trick Room' } },
}

const boostRow: TimelineRow = {
  ...abilityRow,
  message: { key: 'statRose', params: { stat: 'atk', stages: '1' } },
}

const teraRow: TimelineRow = {
  ...abilityRow,
  message: { key: 'terastallized', params: { type: 'Fire' } },
}

/** Belly Drum, which says where a stat now stands rather than how far it moved. */
const setBoostRow: TimelineRow = {
  ...abilityRow,
  message: { key: 'boostSet', params: { stat: 'atk', stages: '+6' } },
}

/** Power Swap: the one row whose parameter is several stat names at once. */
const swapBoostRow: TimelineRow = {
  ...abilityRow,
  targets: [{ species: 'Pikachu', notes: [], health: [] }],
  message: { key: 'boostsSwapped', params: { stats: 'atk,spa' } },
}

/** A damage row whose source the log named, namespace and all. */
const damageRow: TimelineRow = {
  ...abilityRow,
  mark: 'health',
  message: null,
  health: {
    kind: 'damage',
    pokemon: { side: 'p1', position: 'p1a', species: 'Pikachu', nickname: 'Pikachu' },
    hpBefore: 100,
    hpAfter: 90,
    hpDelta: -10,
    from: 'item: Life Orb',
    silent: false,
  } as unknown as TimelineRow['health'],
}

const fieldWithConditions: FieldSnapshot = {
  ...snapshot,
  slots: [
    {
      ...snapshot.slots[0]!,
      status: 'brn',
      boosts: { atk: 1 },
      teraType: 'Fire',
      volatiles: ['Substitute', 'confusion'],
    },
  ],
  screens: { p1: ['Reflect'], p2: [] },
  fieldEffects: ['Trick Room'],
  weather: 'Snowscape',
  fieldAbilities: ['Fairy Aura'],
}

async function mountFieldOf(field: FieldSnapshot, locale: string) {
  return await mountSuspended(FieldBar, {
    props: { snapshot: field, mySide: 'p1' as const, caption: 'Turn 1' },
    route: routeFor(locale),
  })
}

/** What a row says, with the whitespace the template introduces collapsed. */
const said = async (row: TimelineRow, locale: string) =>
  (await mountRowOf(row, locale)).text().replaceAll(/\s+/gu, ' ').trim()

describe('the rest of the vocabulary in en', () => {
  it('is unchanged on every row that carries one', async () => {
    const rows = [
      abilityRow,
      lostItemRow,
      weatherRow,
      weatherClearedRow,
      fieldEffectRow,
      boostRow,
      teraRow,
      damageRow,
      setBoostRow,
      swapBoostRow,
    ]

    // One at a time: the locale is global to the app instance, so mounting
    // these concurrently renders some of them under whichever locale the
    // previous test left behind (measured -- this block read Chinese).
    const texts: string[] = []
    for (const row of rows) texts.push(await said(row, 'en'))

    expect(texts).toEqual([
      'Regenerator',
      'lost its Life Orb',
      'weather · Snowscape',
      'weather · none',
      'Trick Room up',
      'atk +1',
      'terastallized Fire',
      '100% → 90% item: Life Orb',
      'atk set to +6',
      // The arrow is the row pointing at the other Pokémon of the trade; the
      // stat list is joined for the sentence, each name in it English.
      '→swapped atk · spa with Pikachu',
    ])
  })

  it('is unchanged on the field bar chips', async () => {
    const wrapper = await mountFieldOf(fieldWithConditions, 'en')
    const text = wrapper.text().replaceAll(/\s+/gu, ' ')

    for (const chip of [
      'Trick Room',
      'Reflect',
      'brn',
      'atk +1',
      'Tera Fire',
      'Snowscape',
      'Fairy Aura',
      'Substitute',
      'confusion',
    ]) {
      expect(text, chip).toContain(chip)
    }
  })
})

describe('the rest of the vocabulary in zh-TW', () => {
  it('says an ability under its official Chinese name', async () => {
    expect(await said(abilityRow, 'zh-TW')).toBe('再生力')
  })

  it('says a lost item under its official Chinese name', async () => {
    expect(await said(lostItemRow, 'zh-TW')).toBe('失去了 生命寶珠')
  })

  it("says the weather under the state's name, not the move's", async () => {
    // 下雪 is the weather Snowscape; 雪景 is the move of the same name. Both
    // are official strings and only one of them is what this row means.
    const text = await said(weatherRow, 'zh-TW')

    expect(text).toBe('天氣 · 下雪')
    expect(text).not.toContain('雪景')
  })

  it('says the weather running out, which is a word no source has a name for', async () => {
    // `none` is not a name, so it is copy rather than a table entry.
    expect(await said(weatherClearedRow, 'zh-TW')).toBe('天氣 · 無')
  })

  it('says something on the whole field in Chinese', async () => {
    expect(await said(fieldEffectRow, 'zh-TW')).toBe('戲法空間 展開')
  })

  it('says a stat change and a Tera type in Chinese', async () => {
    expect(await said(boostRow, 'zh-TW')).toBe('攻擊 +1')
    expect(await said(teraRow, 'zh-TW')).toBe('太晶化 火')
  })

  it('says a stat a line wrote outright, and every stat a swap traded', async () => {
    expect(await said(setBoostRow, 'zh-TW')).toBe('攻擊 變成 +6')
    // Several identifiers in one parameter, each named on its own (#123).
    expect(await said(swapBoostRow, 'zh-TW')).toContain('互換 攻擊 · 特攻')
  })

  it("says what a [from] blamed under the reader's name for it", async () => {
    const text = await said(damageRow, 'zh-TW')

    expect(text).toContain('生命寶珠')
    expect(text).not.toContain('item: Life Orb')
  })

  it('says the field bar chips in Chinese', async () => {
    const wrapper = await mountFieldOf(fieldWithConditions, 'zh-TW')
    const text = wrapper.text().replaceAll(/\s+/gu, ' ')

    for (const chip of ['戲法空間', '反射壁', '攻擊 +1', '太晶 火', '下雪', '妖精氣場', '替身']) {
      expect(text, chip).toContain(chip)
    }
  })

  it('leaves a volatile the dex spells two ways in English', async () => {
    // `confusion` is the condition 混亂 and the move Confusion 念力, and
    // ADR-0016 declines an id it cannot tell apart rather than guessing. So
    // the chip says `confusion`, like the condition chips beside it.
    const wrapper = await mountFieldOf(fieldWithConditions, 'zh-TW')
    const text = wrapper.text()

    expect(text).toContain('confusion')
    expect(text).not.toContain('念力')
  })

  it("says the weather chip under the state's name, not the move's", async () => {
    // The same trap the weather row has: 下雪 is the state Snowscape, 雪景 the
    // move of that name. The chip means the state.
    const wrapper = await mountFieldOf(fieldWithConditions, 'zh-TW')

    expect(wrapper.text()).not.toContain('雪景')
  })

  it('leaves the condition chip as Showdown spells it', async () => {
    // The one thing on this bar with no official name anywhere: Showdown's own
    // `StatusNames` are eight nulls. English is the honest answer, not a
    // translation this project invented.
    const wrapper = await mountFieldOf(fieldWithConditions, 'zh-TW')

    expect(wrapper.text()).toContain('brn')
  })
})
