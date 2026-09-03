<script setup lang="ts">
import type { PokemonState } from '../utils/battleField'
import { effectDisplayName, statDisplayName, teraTypeDisplayName } from '~/shared/utils/battleTerms'

/**
 * What a Pokémon is carrying right now: its condition, the stat stages it is
 * standing on, whether it has terastallized.
 *
 * The reason the timeline has these at all: the log announces a burn once, and
 * eight turns later nothing on screen says the Pokémon is still burning unless
 * something holds the state.
 *
 * The stat name and the Tera type are said in the reader's language: both have
 * an official string for every value the log can send (Showdown's own
 * `StatNames` and `TypeNames`). **The status code does not**, and that is a
 * fact about the sources rather than a gap here — no upstream has a noun for
 * `brn`, Showdown's `StatusNames` are eight `null`s, and the games say
 * `{POKEMON}被灼傷了！` instead of naming the state. So it keeps Showdown's
 * identifier rather than becoming something this project invented
 * (docs/adr/0016-localised-battle-vocabulary.md).
 */
const props = defineProps<{ pokemon: PokemonState }>()

/** In the order Showdown reports them, so two Pokémon read the same way. */
const STATS = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion']

const { t, locale } = useI18n()

/**
 * A lasting effect, under the reader's name for it. The move → ability → item
 * chain, which declines an id it cannot tell apart: `confusion` is both the
 * condition and the move Confusion, so it stays as Showdown spells it, like
 * the condition chip beside it (docs/adr/0016-localised-battle-vocabulary.md).
 */
const volatiles = computed(() =>
  props.pokemon.volatiles.map((effect) => ({
    effect,
    said: effectDisplayName(effect, locale.value),
  })),
)

const stages = computed(() =>
  STATS.flatMap((stat) => {
    const value = props.pokemon.boosts[stat]

    return value ? [{ stat, value, said: statDisplayName(stat, locale.value) }] : []
  }),
)

const teraType = computed(() =>
  props.pokemon.teraType === null
    ? null
    : teraTypeDisplayName(props.pokemon.teraType, locale.value),
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

    <BattleConditionChip v-for="held of volatiles" :key="held.effect" kind="volatile">
      {{ held.said }}
    </BattleConditionChip>

    <span
      v-for="boost of stages"
      :key="boost.stat"
      class="rounded border px-1 font-mono text-[9px] tracking-wide"
      :class="boost.value > 0 ? 'border-primary/50 text-primary' : 'border-chart-4/50 text-chart-4'"
    >
      {{ boost.said }} {{ boost.value > 0 ? '+' : '−' }}{{ Math.abs(boost.value) }}
    </span>

    <span
      v-if="teraType"
      class="border-chart-3/60 text-chart-3 rounded border px-1 font-mono text-[9px] tracking-wide uppercase"
    >
      {{ t('battle.drawer.tera') }} {{ teraType }}
    </span>
  </span>
</template>
