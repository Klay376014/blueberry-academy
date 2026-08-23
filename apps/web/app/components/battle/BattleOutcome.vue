<script setup lang="ts">
import { Flag } from '@lucide/vue'
import type { DrawerBattle } from '../../composables/useBattleDrawer'

/**
 * How the game ended, at the end of the turns.
 *
 * The last turn of a forfeited game is a turn like any other and then nothing,
 * which reads as a log that was cut off. This is the line that says it was the
 * end, why, and what it cost on the ladder.
 *
 * All of it comes off the stored row rather than out of the log: `parseReplay`
 * has already read the `|win|`, the forfeit message and the rating update into
 * columns, and reading them again here would be a second implementation of the
 * same thing.
 */
const props = defineProps<{ battle: DrawerBattle }>()

const { t } = useI18n()

/**
 * Who forfeited is not shown. The log names them in a `|-message|` line the
 * parser does not keep, and deriving it from the result would be an inference —
 * the verdict beside it already says which way it went.
 */
const reason = computed(() =>
  props.battle.endReason === 'forfeit' ? t('battle.outcome.forfeit') : null,
)

/** The rating before this game, which is the one after it less the change. */
const ratingBefore = computed(() => {
  const { rating, ratingDelta } = props.battle

  return rating === null || ratingDelta === null ? null : rating - ratingDelta
})

const RESULT_TONE = {
  win: 'text-primary',
  loss: 'text-destructive',
  tie: 'text-muted-foreground',
}
</script>

<template>
  <section
    class="border-border mt-3 flex flex-wrap items-center gap-2 border-t pt-3"
    data-testid="battle-outcome"
  >
    <Flag class="text-muted-foreground size-3.5" aria-hidden="true" />

    <span
      class="font-mono text-[11px] tracking-widest uppercase"
      :class="battle.result ? RESULT_TONE[battle.result] : 'text-muted-foreground'"
    >
      {{ battle.result ? t(`battle.result.${battle.result}`) : t('battle.outcome.ended') }}
    </span>

    <span v-if="reason" class="text-muted-foreground text-xs">· {{ reason }}</span>

    <!-- A best-of series is not played on the ladder, so there is no number to
         show and a zero would be a claim about one. -->
    <span
      v-if="battle.rating !== null"
      class="text-muted-foreground ml-auto font-mono text-xs tabular-nums"
      data-testid="rating-change"
    >
      <template v-if="ratingBefore !== null">
        {{ ratingBefore }} <span aria-hidden="true">→</span>
      </template>
      {{ battle.rating }}
      <span
        v-if="battle.ratingDelta !== null"
        :class="battle.ratingDelta > 0 ? 'text-primary' : 'text-destructive'"
      >
        ({{ battle.ratingDelta > 0 ? '+' : '−' }}{{ Math.abs(battle.ratingDelta) }})
      </span>
    </span>
  </section>
</template>
