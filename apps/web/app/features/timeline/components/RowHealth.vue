<script setup lang="ts">
import type { HealthChange } from 'replay-parser'

/**
 * What an action cost one Pokémon, beside that Pokémon's own icon: a small bar
 * of what is left, how much of it went, and what remains.
 *
 * The folded form of `BattleHealthChange`, and drawn only for the changes
 * `timelineRows` let onto an action's row — the log named no other source, and
 * the log itself called this Pokémon a target (issue #97, decision T26).
 *
 * One of these per change rather than a sum: a move that hit twice took two
 * bites, and adding them up would put a number on screen that the log never
 * said.
 */
const props = defineProps<{ change: HealthChange }>()

const hurt = computed(() => props.change.kind === 'damage')
/** The slice between before and after, which is what this hit took. */
const moved = computed(() =>
  props.change.hpDelta === null ? null : Math.abs(props.change.hpDelta),
)
/** `0 fnt` is the log reporting a faint, and `0%` is not how that reads. */
const knockedOut = computed(() => hurt.value && props.change.hpAfter === 0)

const { t } = useI18n()
</script>

<template>
  <span
    class="inline-flex items-center gap-1 font-mono text-[10px] whitespace-nowrap tabular-nums"
    data-testid="row-health"
  >
    <span class="bg-muted relative inline-block h-1.5 w-10 overflow-hidden rounded-full">
      <span
        class="absolute inset-y-0 left-0"
        :class="hurt ? 'bg-primary' : 'bg-chart-2'"
        :style="{ width: `${change.hpAfter}%` }"
      />
      <span
        v-if="hurt && moved"
        class="bg-destructive absolute inset-y-0"
        :style="{ left: `${change.hpAfter}%`, width: `${moved}%` }"
      />
    </span>

    <span v-if="moved !== null" :class="hurt ? 'text-destructive' : 'text-chart-2'">
      {{ hurt ? '−' : '+' }}{{ moved }}%
    </span>

    <span :class="knockedOut ? 'text-destructive' : 'text-muted-foreground'">
      {{ knockedOut ? t('battle.drawer.knockedOut') : `${change.hpAfter}%` }}
    </span>
  </span>
</template>
