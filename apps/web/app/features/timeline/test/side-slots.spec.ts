import { describe, expect, it } from 'vitest'
import { orderedSides, sideLabelKey, sideSlot } from '../utils/sideSlots'
import { fieldLabels, rowClasses } from './fixtures'

/**
 * Which side a row belongs to, and that the two sides are drawn differently —
 * for a battle that has a "me" in it and for a spectated one that does not
 * (#143).
 *
 * The assertions are on what was drawn, not only on the function: nothing in
 * the timeline's tests looked at what a side was drawn as, which is how the
 * two sides came to be drawn identically without anything failing.
 */

describe('sideSlot', () => {
  it('puts my side in the first slot and the opponent in the second', () => {
    expect(sideSlot('p1', 'p1')).toBe('first')
    expect(sideSlot('p2', 'p1')).toBe('second')
    expect(sideSlot('p2', 'p2')).toBe('first')
    expect(sideSlot('p1', 'p2')).toBe('second')
  })

  it('still tells the two sides apart when neither of them is mine', () => {
    expect(sideSlot('p1', null)).toBe('first')
    expect(sideSlot('p2', null)).toBe('second')
  })

  it('gives whatever belongs to no side its own slot', () => {
    expect(sideSlot(null, 'p1')).toBe('neutral')
    expect(sideSlot(null, null)).toBe('neutral')
  })
})

describe('sideLabelKey', () => {
  it('names the sides after the reader when one of them is theirs', () => {
    expect(sideLabelKey('p1', 'p1')).toBe('you')
    expect(sideLabelKey('p2', 'p1')).toBe('opponent')
    expect(sideLabelKey('p2', 'p2')).toBe('you')
    expect(sideLabelKey('p1', 'p2')).toBe('opponent')
  })

  it('leaves a side with no name but its own when neither is mine', () => {
    expect(sideLabelKey('p1', null)).toBe(null)
    expect(sideLabelKey('p2', null)).toBe(null)
  })
})

describe('orderedSides', () => {
  it('draws the first slot first', () => {
    expect(orderedSides('p1')).toEqual(['p1', 'p2'])
    expect(orderedSides('p2')).toEqual(['p2', 'p1'])
    expect(orderedSides(null)).toEqual(['p1', 'p2'])
  })
})

describe('a row of a battle of mine', () => {
  it('draws my side and the opponent differently', async () => {
    const mine = await rowClasses('p1', 'p1')
    const theirs = await rowClasses('p2', 'p1')

    expect(mine).not.toEqual(theirs)
  })

  it('reads the same when I am p2', async () => {
    expect(await rowClasses('p2', 'p2')).toEqual(await rowClasses('p1', 'p1'))
    expect(await rowClasses('p1', 'p2')).toEqual(await rowClasses('p2', 'p1'))
  })

  it('leaves a row that belongs to no side unmarked', async () => {
    const neutral = await rowClasses(null, 'p1')

    expect(neutral).not.toEqual(await rowClasses('p1', 'p1'))
    expect(neutral).not.toEqual(await rowClasses('p2', 'p1'))
  })
})

describe('a row of a spectated battle', () => {
  it('draws p1 and p2 differently', async () => {
    const first = await rowClasses('p1', null)
    const second = await rowClasses('p2', null)

    expect(first).not.toEqual(second)
  })

  it('draws each of them as the slot it occupies', async () => {
    expect(await rowClasses('p1', null)).toEqual(await rowClasses('p1', 'p1'))
    expect(await rowClasses('p2', null)).toEqual(await rowClasses('p2', 'p1'))
  })

  it('leaves a row that belongs to no side unmarked', async () => {
    expect(await rowClasses(null, null)).toEqual(await rowClasses(null, 'p1'))
  })
})

describe('the field bar', () => {
  it('draws the two sides differently when I am p1', async () => {
    const [first, second] = await fieldLabels('p1')

    expect(first?.tone).not.toEqual(second?.tone)
  })

  it('draws them differently when I am p2', async () => {
    const [first, second] = await fieldLabels('p2')

    expect(first?.tone).not.toEqual(second?.tone)
  })

  it('draws them differently when neither of them is mine', async () => {
    const [first, second] = await fieldLabels(null)

    expect(first?.tone).not.toEqual(second?.tone)
  })

  it('names the sides after the reader, whichever side is theirs', async () => {
    expect(await fieldLabels('p1')).toMatchObject([{ said: 'You' }, { said: 'Opp' }])
    expect(await fieldLabels('p2')).toMatchObject([{ said: 'You' }, { said: 'Opp' }])
  })

  it('calls them what the log calls them when neither is mine', async () => {
    expect(await fieldLabels(null)).toMatchObject([{ said: 'P1' }, { said: 'P2' }])
  })
})
