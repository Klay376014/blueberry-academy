import { describe, expect, it } from 'vitest'
import type { SideId } from 'replay-parser'
import { fieldLabels, mountRow, rowClasses, sideMark } from './fixtures'

/**
 * How a row says which side it belongs to — in three channels rather than one
 * (ADR-0017).
 *
 * `side-slots.spec.ts` is about *which* side a row is; this file is about what
 * that side is drawn as, and about the channels holding up once one of them is
 * taken away.
 */

/** The classes on the side mark, which carries the third channel's own hue. */
async function markClasses(side: SideId, mySide: SideId | null) {
  return (await mountRow(side, mySide)).get('[data-testid="side-mark"]').classes()
}

/**
 * The row with everything the side is allowed to change stripped out: the
 * root's own classes and the side mark. What is left is the Pokémon and what it
 * did, which must read identically on both sides — a species icon that changed
 * colour with the side would be a fourth channel nobody asked for, and one that
 * says something the row does not mean.
 */
async function rowBody(side: SideId | null, mySide: SideId | null) {
  const root = (await mountRow(side, mySide)).get('[data-testid="timeline-row"]').element
  root.querySelector('[data-testid="side-mark"]')?.remove()

  return root.innerHTML
}

const hued = (name: string) => /primary|side-second|foreground|destructive|chart-|muted/.test(name)

/**
 * What is left of a row's classes once every hue is gone: the greyscale
 * screenshot, and the reader for whom the two hues are one colour.
 *
 * `transparent` is deliberately treated as colourless — it is an alpha, and a
 * greyscale screenshot keeps it, so a row with no rail at all stays a row with
 * no rail.
 */
const withoutHue = (classes: string[]) => classes.filter((name) => !hued(name))

/** Which classes only one of the two sides has, in either direction. */
function onlyOneSideHas(mine: string[], theirs: string[]) {
  return [
    ...mine.filter((name) => !theirs.includes(name)),
    ...theirs.filter((name) => !mine.includes(name)),
  ].sort()
}

describe('the two sides', () => {
  it('are drawn in a hue of their own, not in two shades of the same one', async () => {
    const theirs = await rowClasses('p2', 'p1')

    expect(theirs.join(' ')).toContain('side-second')
    expect(theirs.filter((name) => name.includes('foreground'))).toEqual([])
  })

  it('mark themselves in that same hue, not in the ink of the theme', async () => {
    const theirs = await markClasses('p2', 'p1')

    expect(theirs).toEqual(expect.arrayContaining(['text-side-second', 'border-side-second/55']))
    expect(theirs.filter((name) => name.includes('foreground'))).toEqual([])
    expect(await markClasses('p1', 'p1')).toContain('text-primary')
  })

  it('carry the same wash strength, so neither reads as the fainter one', async () => {
    const wash = (classes: string[]) => classes.find((name) => name.startsWith('bg-'))

    expect(wash(await rowClasses('p1', 'p1'))).toBe('bg-primary/12')
    expect(wash(await rowClasses('p2', 'p1'))).toBe('bg-side-second/12')
  })

  it('take a solid rail and a dashed one', async () => {
    expect(await rowClasses('p1', 'p1')).toContain('border-solid')
    expect(await rowClasses('p2', 'p1')).toContain('border-dashed')
  })

  it('each say which side they are', async () => {
    expect(await sideMark('p1', 'p1')).toBe('You')
    expect(await sideMark('p2', 'p1')).toBe('Opp')
  })

  it('say it as the log does when neither of them is mine', async () => {
    expect(await sideMark('p1', null)).toBe('P1')
    expect(await sideMark('p2', null)).toBe('P2')
  })

  it('say it in the reader’s language, where there is a word for it', async () => {
    expect(await sideMark('p1', 'p1', 'zh-TW')).toBe('我方')
    expect(await sideMark('p2', 'p1', 'zh-TW')).toBe('對方')

    // `P1` / `P2` is Showdown's own identifier and is not translated
    // (ADR-0016), so a spectated battle reads the same in every locale.
    expect(await sideMark('p1', null, 'zh-TW')).toBe('P1')
  })

  it('read the same on both sides but for the rail and the mark', async () => {
    expect(await rowBody('p1', 'p1')).toEqual(await rowBody('p2', 'p1'))
  })
})

describe('a row belonging to no side', () => {
  it('carries no rail and no mark', async () => {
    expect(await rowClasses(null, 'p1')).toContain('border-l-transparent')
    expect(await sideMark(null, 'p1')).toBe(null)
  })

  it('reads the same whether or not a side of the battle is mine', async () => {
    expect(await rowClasses(null, null)).toEqual(await rowClasses(null, 'p1'))
  })
})

/**
 * The invariant this ticket exists to hold: strip the hue and the sides are
 * still apart.
 *
 * Asserted as *which* classes differ rather than as "something differs".
 * "Something differs" starts passing for the wrong reason as soon as a hue
 * arrives in a form `hued` does not recognise — an arbitrary value, a token
 * named something else — because the unrecognised hue is then counted as one of
 * the colourless channels, and the guard dies quietly while still green.
 */
describe('with the hue taken away', () => {
  it('leaves the dash pattern as what tells the two sides apart', async () => {
    const mine = withoutHue(await rowClasses('p1', 'p1'))
    const theirs = withoutHue(await rowClasses('p2', 'p1'))

    expect(onlyOneSideHas(mine, theirs)).toEqual(['border-dashed', 'border-solid'])
  })

  it('leaves it in a spectated battle too, and the marks still differ', async () => {
    const first = withoutHue(await rowClasses('p1', null))
    const second = withoutHue(await rowClasses('p2', null))

    expect(onlyOneSideHas(first, second)).toEqual(['border-dashed', 'border-solid'])
    expect(await sideMark('p1', null)).not.toBe(await sideMark('p2', null))
  })

  it('leaves the marks as what tells them apart in a battle of mine', async () => {
    expect(await sideMark('p1', 'p1')).not.toBe(await sideMark('p2', 'p1'))
  })

  it('still marks a row of no side off from a row of one', async () => {
    const neutral = withoutHue(await rowClasses(null, 'p1'))
    const mine = withoutHue(await rowClasses('p1', 'p1'))

    expect(onlyOneSideHas(neutral, mine)).toEqual(['border-l-transparent'])
  })
})

describe('the field bar', () => {
  it('takes the same two hues the rows do, so the panel says one thing', async () => {
    const [first, second] = await fieldLabels('p1')

    expect(first?.tone).toContain('text-primary')
    expect(second?.tone).toContain('text-side-second')
    expect(second?.tone).not.toContain('foreground')
  })

  it('takes them in a spectated battle too', async () => {
    const [first, second] = await fieldLabels(null)

    expect(first?.tone).toContain('text-primary')
    expect(second?.tone).toContain('text-side-second')
  })
})
