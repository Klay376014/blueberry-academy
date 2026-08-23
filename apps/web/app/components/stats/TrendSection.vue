<script setup lang="ts">
import { overallTally, resultUnits } from '../../utils/battleStats'
import type { StatsRow } from '../../utils/battleStats'
import { currentStreak, ratingSeries, slidingWinRate } from '../../utils/winRateTrend'
import type { SeriesPoint } from '../../utils/winRateTrend'

/**
 * "How have I been doing lately" — the tallies as three numbers, then the two
 * curves behind them (design document §7).
 *
 * Descriptive statistics and nothing more: the copy here is careful never to
 * say a dip was caused by anything, because none of this can tell you that.
 */
const props = defineProps<{ battles: StatsRow[] }>()

const { t } = useI18n()
const filters = useStatsFilters()

/** The presets the curve is worth reading at. 20 is decision Q21's default. */
const WINDOWS = [10, 20, 50]
const windowSize = ref(20)

const units = computed(() => resultUnits(props.battles, filters.value.aggregate))

const tally = computed(() => overallTally(props.battles, filters.value.aggregate))

/**
 * Always by game, whatever the aggregation is counting: "three in a row" is
 * about the last three things played, and a Bo3 folded into one unit would
 * silently turn three games into one.
 */
const streak = computed(() => currentStreak(resultUnits(props.battles, 'game')))

const winRatePoints = computed<SeriesPoint[]>(() =>
  slidingWinRate(units.value, windowSize.value).map((point) => ({
    date: point.date,
    value: point.rate,
  })),
)

const ratingPoints = computed<SeriesPoint[]>(() =>
  ratingSeries(props.battles).map((point) => ({ date: point.date, value: point.rating })),
)

/**
 * One timeline for both charts, taken from the battles rather than from either
 * series: the same date has to sit above the same date, and the rating chart's
 * own extent stops short wherever the last rated game was.
 */
const xDomain = computed<[number, number]>(() => {
  const dates = props.battles.map((row) => Date.parse(row.played_at))

  return [Math.min(...dates), Math.max(...dates)]
})

function formatRate(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatRating(value: number): string {
  return String(Math.round(value))
}
</script>

<template>
  <section class="flex flex-col gap-3" :aria-label="t('trend.title')">
    <div class="flex flex-wrap items-baseline justify-between gap-3">
      <h2 class="text-xl font-semibold tracking-tight">{{ t('trend.title') }}</h2>

      <fieldset class="flex items-center gap-2">
        <legend class="sr-only">{{ t('trend.window') }}</legend>
        <span aria-hidden="true" class="text-xs text-muted-foreground">{{
          t('trend.window')
        }}</span>
        <div class="flex overflow-hidden rounded-md border border-input">
          <button
            v-for="size of WINDOWS"
            :key="size"
            type="button"
            class="h-8 cursor-pointer px-3 font-mono text-xs transition-colors"
            :class="
              windowSize === size
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:bg-accent'
            "
            :aria-pressed="windowSize === size"
            :aria-label="t('trend.windowOf', { count: size })"
            :data-testid="`trend-window-${size}`"
            @click="() => (windowSize = size)"
          >
            {{ size }}
          </button>
        </div>
      </fieldset>
    </div>

    <div class="grid gap-3 sm:grid-cols-3">
      <div class="rounded-lg border border-border bg-card p-3">
        <span class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          {{ t('summary.games') }}
        </span>
        <p class="font-mono text-3xl tabular-nums" data-testid="summary-games">
          {{ tally.games }}
        </p>
      </div>

      <div class="rounded-lg border border-border bg-card p-3">
        <span class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          {{ t('summary.winRate') }}
        </span>
        <p class="font-mono text-3xl tabular-nums" data-testid="summary-rate">
          {{ formatRate(tally.winRate) }}
        </p>
        <p class="font-mono text-[11px] text-muted-foreground tabular-nums">
          {{ tally.wins }}–{{ tally.losses }}
        </p>
      </div>

      <div class="rounded-lg border border-border bg-card p-3">
        <span class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          {{ t('summary.streak') }}
        </span>
        <p class="font-mono text-3xl tabular-nums" data-testid="summary-streak">
          {{ streak.kind === 'none' ? '—' : streak.length }}
        </p>
        <p class="font-mono text-[11px] text-muted-foreground">
          {{
            streak.kind === 'none'
              ? t('summary.streakNone')
              : t(streak.kind === 'win' ? 'summary.streakWins' : 'summary.streakLosses')
          }}
        </p>
      </div>
    </div>

    <div class="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <StatsTrendChart
        :points="winRatePoints"
        :x-domain
        :y-domain="[0, 1]"
        :label="t('trend.winRate', { count: windowSize })"
        color="var(--chart-1)"
        :format-value="formatRate"
        :reference="0.5"
        :height="180"
        data-testid="trend-win-rate"
      />

      <StatsTrendChart
        :points="ratingPoints"
        :x-domain
        :label="t('trend.rating')"
        color="var(--chart-2)"
        :format-value="formatRating"
        :empty-label="t('trend.noRating')"
        show-dates
        data-testid="trend-rating"
      />

      <div class="flex items-start gap-2">
        <span class="text-xs text-muted-foreground">{{ t('trend.descriptive') }}</span>
        <InfoHint :label="t('trend.whatIsThis')">{{ t('trend.gap') }}</InfoHint>
      </div>
    </div>
  </section>
</template>
