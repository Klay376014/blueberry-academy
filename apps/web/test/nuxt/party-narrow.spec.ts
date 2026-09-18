import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import SpeciesParty from '../../app/shared/components/SpeciesParty.vue'

/**
 * The class contract of docs/specs/2026-09-18-responsive-baseline.md §4 for the
 * party row. §6 of it says what this cannot see: jsdom lays nothing out, so
 * nothing here may claim the row fitted, wrapped or stopped overflowing.
 */

const TEAM = 'calyrexshadow|incineroar|ironhands|ragingbolt|rillaboom|urshifu'
const BRING = 'calyrexshadow|incineroar|ironhands|urshifu'

const partyOfSix = (props: Record<string, unknown> = {}) =>
  mountSuspended(SpeciesParty, { props: { signature: TEAM, ...props } })

describe('the party row in a container narrower than itself', () => {
  it('answers the width by wrapping, which is the content-driven half of §4', async () => {
    // How many of the six fit on a line depends on the caller's size and on
    // what else shares the row, not on the viewport.
    expect((await partyOfSix()).classes()).toContain('flex-wrap')
  })

  it('keeps the caller size as the intent, not a number the component picks', async () => {
    const icons = (await partyOfSix({ size: 48 })).findAll('[title]')

    expect(icons).toHaveLength(6)
    for (const icon of icons) expect(icon.attributes('style')).toContain('width: 48px')
  })

  it('leaves every icon its whole cell, so a wrapped row draws no cropped sprite', async () => {
    // The sheet cell is a fixed 40x30 and `size` scales the sprite drawn into
    // it; a narrowed window would cut the sprite rather than shrink it.
    for (const icon of (await partyOfSix()).findAll('[title]'))
      expect(icon.classes()).toContain('shrink-0')
  })

  it('still marks the ones that did not appear once the row is allowed to wrap', async () => {
    const absent = (await partyOfSix({ bring: BRING })).findAll('[data-absent="true"]')

    expect(absent.map((icon) => icon.attributes('title'))).toEqual([
      'Raging Bolt (did not appear)',
      'Rillaboom (did not appear)',
    ])
    for (const icon of absent) expect(icon.classes()).toContain('grayscale')
  })
})
