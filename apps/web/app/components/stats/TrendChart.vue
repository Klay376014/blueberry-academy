<script setup lang="ts">
import { CurveType } from '@unovis/ts'
import { VisAxis, VisLine, VisXYContainer } from '@unovis/vue'
import type { SeriesPoint } from '../../utils/winRateTrend'

/**
 * One line over a calendar x-axis, with the gaps left as gaps.
 *
 * A point's `value` is `undefined`, never `null`, where there is no reading:
 * Unovis breaks the line at `undefined` and plots `null` as zero
 * (unovis.dev/docs/xy-charts/Line). Interpolating instead would invent a
 * number for a day nothing was played — decision Q21.
 *
 * The x domain is passed in rather than derived, so several of these stack up
 * sharing one timeline and the same date sits above the same date.
 */
const props = defineProps<{
  points: SeriesPoint[]
  xDomain: [number, number]
  /**
   * Pinned where the quantity has natural bounds. Left off, the scale fits
   * itself to the data, and a win rate that only ever moved between 48% and
   * 55% would fill the frame top to bottom as if it had swung wildly.
   */
  yDomain?: [number, number]
  /** The chart's own name, for the region label. */
  label: string
  color: string
  formatValue: (value: number) => string
  /**
   * A horizontal line to read the series against — 50% on a win rate, where
   * "above or below even" is the first thing anybody wants off the chart and
   * counting up from the axis is a poor way to get it.
   */
  reference?: number
  height?: number
  /** Only the last chart in a stack carries the dates; the rest would repeat them. */
  showDates?: boolean
  /** Shown in place of the line when nothing in `points` has a reading. */
  emptyLabel?: string
}>()

const { locale } = useI18n()

const x = (point: SeriesPoint) => point.date
const y = (point: SeriesPoint) => point.value

const empty = computed(() => props.points.every((point) => point.value === undefined))

/**
 * Bumped on every new set of points, and used as the container's `key`, so a
 * changed series remounts the chart.
 *
 * Blunt, but @unovis/vue 1.6.7 does not redraw on a data-only change: the
 * container hands new data down with its `preventRender` flag set
 * (`containers/xy-container/index.js`: `watch(data, () => setData(data, true))`)
 * and only renders again when a *config* prop changes. Changing the window
 * size changes nothing but the data, so without this the caption would read
 * "window of 50" over a curve still drawn at 20.
 *
 * Not covered by a test: under jsdom the container redraws either way, so a
 * test would pass with this removed. Verified by hand in Chrome instead —
 * switching the window there left the path untouched until this went in.
 */
const revision = ref(0)

watch(
  () => props.points,
  () => {
    revision.value += 1
  },
)

const dateFormat = computed(
  () => new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric' }),
)

function formatDate(value: number): string {
  return dateFormat.value.format(value)
}
</script>

<template>
  <figure class="trend-chart flex flex-col gap-1" :aria-label="label">
    <figcaption class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
      {{ label }}
    </figcaption>

    <div class="relative">
      <VisXYContainer
        :key="revision"
        :data="points"
        :x-domain
        :y-domain
        :height="height ?? 132"
        :margin="{ left: 4 }"
      >
        <VisLine :x :y :color :curve-type="CurveType.Linear" />
        <VisLine
          v-if="reference !== undefined"
          :x
          :y="() => reference"
          :line-width="1"
          :line-dash-array="[3, 3]"
          :curve-type="CurveType.Linear"
          exclude-from-domain-calculation
          color="var(--muted-foreground)"
        />
        <VisAxis type="y" :num-ticks="3" :tick-format="formatValue" />
        <VisAxis
          v-if="showDates"
          type="x"
          :num-ticks="4"
          :tick-format="formatDate"
          :grid-line="false"
        />
      </VisXYContainer>

      <p
        v-if="empty && emptyLabel"
        class="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-muted-foreground"
        data-testid="trend-empty"
      >
        {{ emptyLabel }}
      </p>
    </div>
  </figure>
</template>

<style scoped>
/* Unovis reads its own palette off CSS variables. Ours already flip with the
   `.dark` class, so light and dark get the same declaration and the
   `--vis-dark-*` fallbacks are pointed at it too. */
.trend-chart {
  --vis-font-family: inherit;
  --vis-axis-tick-color: transparent;
  --vis-axis-domain-color: transparent;
  --vis-axis-grid-color: var(--border);
  --vis-dark-axis-grid-color: var(--border);
  --vis-axis-tick-label-color: var(--muted-foreground);
  --vis-dark-axis-tick-label-color: var(--muted-foreground);
  --vis-axis-tick-label-font-size: 10px;
}
</style>
