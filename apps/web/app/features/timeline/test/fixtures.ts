import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { SideId } from 'replay-parser'
import EventRow from '../components/EventRow.vue'
import FieldBar from '../components/FieldBar.vue'
import type { TimelineRow } from '../utils/timelineRows'
import type { FieldSnapshot } from '../utils/battleField'

/**
 * The drawer's two ways of showing a side — a timeline row and the field bar —
 * as the specs about which side it is (`side-slots.spec.ts`) and about what
 * that side is drawn as (`side-encoding.spec.ts`) both need them.
 */
export function row(overrides: Partial<TimelineRow> = {}): TimelineRow {
  return {
    mark: 'move',
    side: 'p1',
    species: 'Scrafty',
    move: 'Fake Out',
    targets: [],
    bystanders: [],
    notes: [],
    message: null,
    quiet: false,
    health: null,
    status: null,
    tone: null,
    ...overrides,
  }
}

/** `route` picks the locale, the way `localised-names.spec.ts` does. */
export async function mountRow(side: SideId | null, mySide: SideId | null, locale = 'en') {
  return await mountSuspended(EventRow, {
    props: { row: row({ side }), mySide },
    route: locale === 'en' ? '/' : `/${locale}/`,
  })
}

/** The classes on the row itself, which is where the rail and the wash are. */
export async function rowClasses(side: SideId | null, mySide: SideId | null) {
  return (await mountRow(side, mySide)).get('[data-testid="timeline-row"]').classes()
}

/** What the side mark says, or null when the row carries none. */
export async function sideMark(side: SideId | null, mySide: SideId | null, locale = 'en') {
  const mark = (await mountRow(side, mySide, locale)).find('[data-testid="side-mark"]')

  return mark.exists() ? mark.text() : null
}

/** Both sides on the field, so a bar has two labels to draw. */
export const SNAPSHOT: FieldSnapshot = {
  turn: 1,
  slots: (['p1', 'p2'] as SideId[]).map((side) => ({
    side,
    position: `${side}a`,
    species: side === 'p1' ? 'Scrafty' : 'Suicune',
    hp: 100,
    status: null,
    boosts: {},
    volatiles: [],
    teraType: null,
    fainted: false,
  })),
  offField: [],
  screens: { p1: [], p2: [] },
  fieldEffects: [],
  weather: null,
  fieldAbilities: [],
}

/** Each side's label on the bar, in the order the bar draws them. */
export async function fieldLabels(mySide: SideId | null) {
  const wrapper = await mountSuspended(FieldBar, {
    props: { snapshot: SNAPSHOT, mySide, caption: 'Turn 1' },
  })

  return wrapper.findAll('[data-testid="side-label"]').map((label) => ({
    tone: label.classes().join(' '),
    said: label.text(),
  }))
}
