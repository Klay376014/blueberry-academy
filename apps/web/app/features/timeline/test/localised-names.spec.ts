import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import EventRow from '../components/EventRow.vue'
import FieldBar from '../components/FieldBar.vue'
import type { FieldSnapshot } from '../utils/battleField'
import type { TimelineRow } from '../utils/timelineRows'

/**
 * Which name the timeline puts a Pokémon under, per locale, and what is left of
 * the English one. See docs/adr/0014-localised-species-names.md.
 *
 * The `en` cases are the point of the file as much as the `zh-TW` ones: the
 * English screen is not supposed to have moved at all (#101).
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
      teraType: null,
      fainted: false,
    },
  ],
  offField: [],
  screens: { p1: [], p2: [] },
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
      '九尾（阿羅拉的樣子） (Ninetales-Alola)',
      '皮卡丘 (Pikachu)',
    ])
  })

  it('names the field bar icons in Chinese, English still attached', async () => {
    const wrapper = await mountField('zh-TW')
    const icon = wrapper.get('[title]')

    expect(icon.attributes('title')).toBe('九尾（阿羅拉的樣子） (Ninetales-Alola)')
    expect(icon.attributes('aria-label')).toBe('九尾（阿羅拉的樣子） (Ninetales-Alola)')
  })

  it('shows the forme it was in, not its base species', async () => {
    // The timeline is the one path that does not undo battle formes
    // (CONTEXT.md, ADR-0008), and the localised table is keyed the same way, so
    // Alolan Ninetales must not come back as plain 九尾.
    const wrapper = await mountField('zh-TW')

    expect(wrapper.get('[title]').attributes('title')).not.toBe('九尾 (Ninetales)')
  })
})
