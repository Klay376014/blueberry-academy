import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import Dashboard from '../../../pages/index.vue'
import TeamDetail from '../../../pages/teams/[id].vue'
import { teamRouteId } from '../utils/teamRoute'
import { fakeBattles } from '../../../../test/fakes/battles'
import type { FakeBattles, StoredBattle } from '../../../../test/fakes/battles'
import { FORMATS, SIGNATURES, STATS_ROWS } from '../../../../test/fixtures/stats-rows'
import { signIn } from '../../../../test/helpers'

/**
 * The dashboard and the team detail page, over the in-memory `Battles`
 * adapter. What is asserted is what a user is shown: the ordering rule doing
 * its job, the low-sample team still on screen, and the gap between the team's
 * games and its brings explained rather than left to look like an arithmetic
 * error.
 */

const { battles } = vi.hoisted(() => ({ battles: { value: null as unknown } }))

mockNuxtImport('useBattles', () => () => battles.value as never)

/** The rows the pages will read, replacing whatever the fixture had. */
function answerWith(rows: StoredBattle[]) {
  ;(battles.value as FakeBattles).rows = rows
}

const { routeParams } = vi.hoisted(() => ({ routeParams: { value: { id: '' } } }))

// `meta` because a real route always has one and the layout the page draws
// reads it (issue #126); without it `<NuxtLayout>` throws on mount.
mockNuxtImport(
  'useRoute',
  () => () => ({ params: routeParams.value, query: {}, meta: {} }) as never,
)

/** A team's worth of rows: `wins` won, the rest lost, all brings complete. */
function rowsFor(options: {
  formatId: string
  team: string
  bring: string
  games: number
  wins: number
  tag: string
}): StoredBattle[] {
  return Array.from({ length: options.games }, (_, index) => ({
    replay_id: `${options.tag}-${index}`,
    played_at: `2026-07-${String((index % 28) + 1).padStart(2, '0')}T10:00:00Z`,
    format_id: options.formatId,
    series_id: null,
    my_username: 'NotLittleStar',
    result: index < options.wins ? ('win' as const) : ('loss' as const),
    rating: null,
    rating_delta: null,
    team_signature: options.team,
    bring_signature: options.bring,
    bring_complete: true,
  }))
}

/** Moves the required format filter, and lets the page settle after it. */
async function pickFormat(
  page: {
    get: (selector: string) => { element: Element; trigger: (event: string) => Promise<void> }
  },
  formatId: string,
) {
  const select = page.get('[data-testid="filter-format"]')

  ;(select.element as HTMLSelectElement).value = formatId
  await select.trigger('change')
}

beforeEach(() => {
  battles.value = fakeBattles(STATS_ROWS)

  signIn()
  useStatsFilters().value = defaultStatsFilters()
  useState('stats-rows').value = null
  routeParams.value = { id: '' }
})

describe('the dashboard', () => {
  it('ranks a perfect three-game team below a twenty-game one', async () => {
    // The whole reason the sort key is the Wilson lower bound: three wins from
    // three is a 100% win rate and belongs below a season of 70%.
    answerWith([
      ...rowsFor({
        formatId: FORMATS.LADDER,
        team: SIGNATURES.TEAM_A,
        bring: SIGNATURES.BRING_A1,
        games: 3,
        wins: 3,
        tag: 'perfect',
      }),
      ...rowsFor({
        formatId: FORMATS.LADDER,
        team: SIGNATURES.TEAM_B,
        bring: SIGNATURES.BRING_B1,
        games: 20,
        wins: 14,
        tag: 'seasoned',
      }),
    ])

    const page = await mountSuspended(Dashboard)
    const cards = page.findAll('[data-testid="team-card"]')

    expect(cards).toHaveLength(2)
    expect(cards[0]!.text()).toContain('14–6')
    expect(cards[1]!.text()).toContain('3–0')
  })

  it('keeps a two-game team on screen, with its sample size', async () => {
    // Hiding a low-sample grouping only leaves the user hunting for their team.
    const page = await mountSuspended(Dashboard)
    const text = page.findAll('[data-testid="team-card"]').map((card) => card.text())

    expect(text.some((entry) => entry.includes('1 games'))).toBe(true)
    for (const entry of text) expect(entry).toMatch(/\d+ games/)
  })

  it('files the same six in two formats as two teams', async () => {
    // A Bo1 team and its Bo3 counterpart are different teams (CONTEXT.md), so
    // they are never on screen together: the format is a required filter and
    // each registration belongs to one of them.
    const page = await mountSuspended(Dashboard)

    const ladder = page.findAll('[data-testid="team-card"]')
    expect(ladder).toHaveLength(2)

    await pickFormat(page, FORMATS.EVENT)

    const event = page.findAll('[data-testid="team-card"]')
    expect(event).toHaveLength(2)
    for (const card of event) expect(card.text()).toContain('BO3')
  })

  it('opens on the format with the most games behind it', async () => {
    // Seven ladder games against five of the Bo3 event. Opening on whichever
    // format sorted first alphabetically would show an account its Hackmons
    // Cup rather than its ladder.
    const page = await mountSuspended(Dashboard)

    expect((page.find('[data-testid="filter-format"]').element as HTMLSelectElement).value).toBe(
      FORMATS.LADDER,
    )
    // And no way to ask for every format at once: a win rate pooled across
    // regulations answers nobody's question.
    expect(page.findAll('[data-testid="filter-format"] option')).toHaveLength(2)
  })

  it('says series where the number it shows is a series count', async () => {
    // The card's sample size is the team's tally, which is series under a Bo3
    // format. "1 games" beside a team that played three would be a lie of the
    // same kind the summary tile was fixed for.
    const page = await mountSuspended(Dashboard)
    await pickFormat(page, FORMATS.EVENT)

    const text = page.findAll('[data-testid="team-card"]').map((card) => card.text())

    expect(text.every((entry) => /\d+ series/.test(entry))).toBe(true)
    for (const entry of text) expect(entry).not.toMatch(/\d+ games/)
  })

  it('does not ask which unit to count in, having already been told', async () => {
    // The format settles it: a ladder Bo1 format and its Bo3 counterpart are
    // different formats, so choosing one chooses the unit.
    const page = await mountSuspended(Dashboard)

    expect(page.find('[data-testid="filter-by-game"]').exists()).toBe(false)
    expect(page.find('[data-testid="filter-by-series"]').exists()).toBe(false)
  })

  it('names Pokémon in English, from the generated table rather than a locale', async () => {
    const page = await mountSuspended(Dashboard)

    expect(page.html()).toContain('Calyrex-Shadow')
  })

  it('offers to import when nothing matches', async () => {
    answerWith([])

    const page = await mountSuspended(Dashboard)

    expect(page.findAll('[data-testid="team-card"]')).toHaveLength(0)
    expect(page.html()).toContain('/import')
  })
})

describe('one team in detail', () => {
  beforeEach(() => {
    routeParams.value = {
      id: teamRouteId({ formatId: FORMATS.LADDER, signature: SIGNATURES.TEAM_A }),
    }
  })

  it('lists only the brings that were complete', async () => {
    // The forfeited game's three-Pokémon signature is not a fourth bring the
    // user ever picked, so it is not offered as one.
    const page = await mountSuspended(TeamDetail)

    const brings = page.findAll('[data-testid="bring"]')

    expect(brings).toHaveLength(1)
    expect(page.html()).not.toContain('calyrexshadow|incineroar|urshifu')
  })

  it('draws a bring against the six it was picked from', async () => {
    // The point of a bring row is which four of the six went; the other two
    // have to be on screen for that to be readable, and the team already knows
    // them — no new data is needed here.
    const page = await mountSuspended(TeamDetail)

    const bring = page.find('[data-testid="bring"]')
    const party = bring.find('span[role="img"]')

    // The registered six, with the two that were left behind named as absent.
    expect(party.findAll('span[title]')).toHaveLength(6)
    expect(party.attributes('aria-label')).toContain('(did not appear)')
  })

  it('explains the games the brings do not account for', async () => {
    const page = await mountSuspended(TeamDetail)

    // Four games for the team under the chosen name, three across its brings
    // — ladder-7 is SomeAlt's, and the name is a required filter too.
    expect(page.find('[data-testid="team-games"]').text()).toBe('4')
    expect(page.find('[data-testid="unfiled-slice"]').exists()).toBe(true)
    expect(page.find('[data-testid="unfiled-note"]').text()).toContain('1')
  })

  it('says so when the address names no team the filters admit', async () => {
    routeParams.value = { id: teamRouteId({ formatId: FORMATS.LADDER, signature: 'nobody' }) }

    const page = await mountSuspended(TeamDetail)

    expect(page.find('[data-testid="team-missing"]').exists()).toBe(true)
  })

  it('steps to the next team without going back to the dashboard', async () => {
    const page = await mountSuspended(TeamDetail)

    expect(page.find('[data-testid="step-next"]').exists()).toBe(true)
  })
})
