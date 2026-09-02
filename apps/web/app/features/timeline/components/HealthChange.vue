<script setup lang="ts">
import type { HealthChange } from 'replay-parser'
import { sourceDisplayName } from '~/shared/utils/battleTerms'

/**
 * A change in HP: the bar that is left, the piece that went, and the two
 * numbers.
 *
 * The form for a change that stands on its own: recoil, a burn's tick, the
 * Leftovers at the end of a turn. A change that belongs to a move's target is
 * drawn beside that target's icon instead, by `BattleRowHealth` — see decision
 * T26 for the two fields that tell the two apart, and T5 for the attribution
 * neither of them performs.
 *
 * `from` is shown only when the log itself named a source — burn, an item, an
 * ability — which is exactly when there is one to name, and on this form it
 * always is. It is the one identifier the parser hands over with its namespace
 * still on it, so it is the one the reader's name for it can be looked up by
 * the log's own word rather than by the dex
 * (docs/adr/0016-localised-battle-vocabulary.md).
 */
const props = defineProps<{ health: HealthChange }>()

const { locale } = useI18n()

/** What the log blamed, under the reader's name for it. */
const from = computed(() =>
  props.health.from === null ? null : sourceDisplayName(props.health.from, locale.value),
)

const hurt = computed(() => props.health.kind === 'damage')
/** The slice between before and after, which is what the hit took. */
const lost = computed(() => {
  const { hpBefore, hpAfter } = props.health

  return hpBefore === null ? 0 : Math.max(0, hpBefore - hpAfter)
})
</script>

<template>
  <span class="inline-flex items-center gap-2" data-testid="health-change">
    <span class="bg-muted relative inline-block h-1.5 w-20 overflow-hidden rounded-full">
      <span
        class="absolute inset-y-0 left-0"
        :class="hurt ? 'bg-primary' : 'bg-chart-2'"
        :style="{ width: `${health.hpAfter}%` }"
      />
      <span
        v-if="hurt && lost"
        class="bg-destructive absolute inset-y-0"
        :style="{ left: `${health.hpAfter}%`, width: `${lost}%` }"
      />
    </span>

    <span
      class="font-mono text-xs tabular-nums"
      :class="hurt ? 'text-destructive' : 'text-chart-2'"
    >
      <span class="text-muted-foreground">{{ health.hpBefore ?? '?' }}%</span>
      <span class="text-muted-foreground" aria-hidden="true"> → </span>
      {{ health.hpAfter }}%
    </span>

    <span v-if="from" class="text-muted-foreground text-xs">{{ from }}</span>
  </span>
</template>
