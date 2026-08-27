<script setup lang="ts">
import type { FieldSlot } from '../utils/battleField'

/**
 * What a Pokémon is carrying right now: its condition, the stat stages it is
 * standing on, whether it has terastallized.
 *
 * The reason the timeline has these at all: the log announces a burn once, and
 * eight turns later nothing on screen says the Pokémon is still burning unless
 * something holds the state.
 *
 * The stat and status names are Showdown's own (`atk`, `brn`) and stay as they
 * are — like species and move names, they are identifiers rather than copy.
 */
const props = defineProps<{ pokemon: FieldSlot }>()

/** In the order Showdown reports them, so two Pokémon read the same way. */
const STATS = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion']

const stages = computed(() =>
  STATS.flatMap((stat) => {
    const value = props.pokemon.boosts[stat]

    return value ? [{ stat, value }] : []
  }),
)

/** Burn reads as damage, sleep and paralysis as a warning, poison as neither. */
const STATUS_TONE: Record<string, string> = {
  brn: 'text-destructive border-destructive/50',
  par: 'text-chart-4 border-chart-4/50',
  slp: 'text-chart-4 border-chart-4/50',
  frz: 'text-chart-4 border-chart-4/50',
  psn: 'text-chart-2 border-chart-2/50',
  tox: 'text-chart-2 border-chart-2/50',
}
</script>

<template>
  <span class="inline-flex flex-wrap items-center gap-1">
    <span
      v-if="pokemon.status"
      class="rounded border px-1 font-mono text-[9px] tracking-wide uppercase"
      :class="STATUS_TONE[pokemon.status] ?? 'border-border text-muted-foreground'"
    >
      {{ pokemon.status }}
    </span>

    <span
      v-for="boost of stages"
      :key="boost.stat"
      class="rounded border px-1 font-mono text-[9px] tracking-wide"
      :class="boost.value > 0 ? 'border-primary/50 text-primary' : 'border-chart-4/50 text-chart-4'"
    >
      {{ boost.stat }} {{ boost.value > 0 ? '+' : '−' }}{{ Math.abs(boost.value) }}
    </span>

    <span
      v-if="pokemon.teraType"
      class="border-chart-3/60 text-chart-3 rounded border px-1 font-mono text-[9px] tracking-wide uppercase"
    >
      Tera {{ pokemon.teraType }}
    </span>
  </span>
</template>
