import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h } from 'vue'
import DrawerHeader from '../components/DrawerHeader.vue'
import type { DrawerBattle } from '../composables/useBattleDrawer'
import { battle, spectated } from './fixtures'

/**
 * The two players at the top of the drawer, and whether they read as the same
 * two sides as the timeline underneath them (#145).
 *
 * The header used to name both columns in the same ink, so a reader who had
 * learned which hue was which from the rows had nothing at the top to match it
 * against.
 */

/**
 * The sheet's own title and description come from reka-ui, which needs the
 * dialog root to render at all — and the root is `BattleDrawer`, one level up.
 * Stubbed as what they are here, a heading and a hidden line, so that mounting
 * the header does not mean mounting the drawer and everything it fetches.
 */
const slotted = (tag: string) =>
  defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h(tag, slots.default?.()),
  })

async function header(of: DrawerBattle) {
  return await mountSuspended(DrawerHeader, {
    props: { battle: of, games: [] },
    global: {
      // Nuxt registers `shared/components/ui` with a `Ui` prefix, so these
      // are the names the stubs have to answer to.
      stubs: { UiSheetTitle: slotted('h2'), UiSheetDescription: slotted('p') },
    },
  })
}

/** Each column's name, in the order the header draws them. */
async function names(of: DrawerBattle) {
  return (await header(of)).findAll('[data-testid="side-name"]').map((name) => ({
    tone: name.classes().join(' '),
    said: name.text(),
  }))
}

/** Each column's side mark. */
async function marks(of: DrawerBattle) {
  return (await header(of)).findAll('[data-testid="side-mark"]').map((mark) => mark.text())
}

describe('a battle of mine', () => {
  it('takes the first hue for me and the second for the opponent', async () => {
    const [mine, theirs] = await names(battle())

    expect(mine?.tone).toContain('text-primary')
    expect(theirs?.tone).toContain('text-side-second')
  })

  it('names the two columns after the reader', async () => {
    expect(await marks(battle())).toEqual(['You', 'Opp'])
  })

  it('reads the same when I am p2', async () => {
    const [mine, theirs] = await names(battle({ mySide: 'p2' }))

    expect(mine?.tone).toContain('text-primary')
    expect(theirs?.tone).toContain('text-side-second')
    expect(await marks(battle({ mySide: 'p2' }))).toEqual(['You', 'Opp'])
  })

  it('still leaves the winner unmarked — the result badge already said it', async () => {
    const wrapper = await header(battle())

    expect(wrapper.find('[data-testid="side-won"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="battle-result"]').text()).toBe('Win')
  })
})

describe('a spectated battle', () => {
  it('takes the same two hues, in p1 then p2 order', async () => {
    const [first, second] = await names(spectated())

    expect(first?.tone).toContain('text-primary')
    expect(second?.tone).toContain('text-side-second')
  })

  it('calls them what the log calls them, borrowing no "you"', async () => {
    expect(await marks(spectated())).toEqual(['P1', 'P2'])

    const said = (await names(spectated())).map((name) => name.said)

    expect(said).not.toContain('You')
  })

  it('marks the winner, which is the only thing that says who won', async () => {
    const wrapper = await header(spectated({ winner: 'p1' }))

    expect(wrapper.findAll('[data-testid="side-won"]')).toHaveLength(1)
  })

  it('marks each column in that side’s own hue', async () => {
    const wrapper = await header(spectated())
    const tones = wrapper.findAll('[data-testid="side-mark"]').map((m) => m.classes().join(' '))

    expect(tones[0]).toContain('text-primary')
    expect(tones[1]).toContain('text-side-second')
  })

  it('marks the winner in that side’s own hue', async () => {
    const wrapper = await header(spectated({ winner: 'p2' }))

    expect(wrapper.get('[data-testid="side-won"]').classes().join(' ')).toContain(
      'text-side-second',
    )
  })
})

describe('a row that never parsed', () => {
  it('names neither column as a side, because the log identified neither', async () => {
    const unparsed = battle({ mySide: null, parseError: 'no |player| line', result: null })

    expect(await marks(unparsed)).toEqual([])
  })
})
