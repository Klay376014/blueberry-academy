import { describe, expect, it } from 'vitest'
import { wilsonLowerBound } from '../../app/utils/wilson'

describe('the Wilson lower bound', () => {
  it('puts three from three below fourteen from twenty', () => {
    // The whole reason ranking is not by raw win rate: 100% of three games
    // would otherwise sit above a season's worth of 70%.
    expect(wilsonLowerBound(3, 3)).toBeLessThan(wilsonLowerBound(14, 20))
  })

  it('agrees with a statistics table', () => {
    expect(wilsonLowerBound(3, 3)).toBeCloseTo(0.4385, 4)
    expect(wilsonLowerBound(14, 20)).toBeCloseTo(0.48103, 5)
  })

  it('rises towards the win rate as the sample grows', () => {
    const bounds = [10, 100, 1000, 100_000].map((games) => wilsonLowerBound(games * 0.7, games))

    expect(bounds).toEqual([...bounds].sort((a, b) => a - b))
    expect(bounds.at(-1)).toBeCloseTo(0.7, 2)
    // Never reaching it, however many games: it is a lower bound.
    expect(bounds.at(-1)).toBeLessThan(0.7)
  })

  it('answers zero for no games rather than NaN', () => {
    // A grouping with nothing in it is a real thing to sort. A NaN would
    // scramble the comparison instead of putting one row at the bottom.
    expect(wilsonLowerBound(0, 0)).toBe(0)
    expect(Number.isNaN(wilsonLowerBound(0, 0))).toBe(false)
  })

  it('stays inside zero and one at the edges', () => {
    // Exactly zero in the arithmetic; only floating point decides which side
    // of it the last bit lands on, and the clamp catches the other one.
    expect(wilsonLowerBound(0, 1)).toBeCloseTo(0, 10)
    expect(wilsonLowerBound(1, 1)).toBeGreaterThan(0)
    expect(wilsonLowerBound(1, 1)).toBeLessThan(1)
    // A caller counting ties into the denominator only cannot push it over.
    expect(wilsonLowerBound(5, 3)).toBeLessThan(1)
  })
})
