<script setup lang="ts">
import { ArrowRightLeft, Gem, HeartPulse, Skull, Sparkles, Zap } from '@lucide/vue'
import { toID } from 'replay-parser'
import type { SideId } from 'replay-parser'
import type { TimelineRow } from '../../utils/timelineRows'
import { speciesName } from '../../utils/speciesName'

/**
 * One thing that happened, on one line.
 *
 * The Pokémon is its icon and nothing else: an icon reads the same in every
 * locale, and the English name it stands for is on it as a label rather than
 * beside it. The move keeps its English name, which has no icon to become.
 *
 * Whose it is shows in the rail down the left rather than in words, so the two
 * sides are told apart without a column of names.
 */
const props = defineProps<{ row: TimelineRow; mySide: SideId | null }>()

const MARKS = {
  move: Zap,
  switch: ArrowRightLeft,
  health: HeartPulse,
  faint: Skull,
  tera: Gem,
  forme: Sparkles,
  status: HeartPulse,
  none: null,
}

const mark = computed(() => MARKS[props.row.mark])
const mine = computed(() => props.row.side !== null && props.row.side === props.mySide)

const { t } = useI18n()

/**
 * The row in words. The names are passed in as parameters because the icons
 * carry them visually and a screen reader has no icon to read: `pokemon` is the
 * row's subject and `into` whatever it points at.
 */
const message = computed(() => {
  const said = props.row.message
  if (!said) return null

  const named = (species: string | undefined) =>
    species === undefined ? '' : speciesName(toID(species))

  return t(`battle.event.${said.key}`, {
    ...said.params,
    pokemon: named(props.row.species ?? undefined),
    into: named(props.row.targets[0]),
  })
})
</script>

<template>
  <!-- Whose row this is, in colour rather than in words: the ink of the theme
       against its accent, plus a wash of each so a row reads as one side's at a
       glance rather than by looking at the rail. -->
  <div
    class="grid grid-cols-[14px_28px_1fr] items-center gap-2 rounded-sm border-l-2 py-0.5 pr-1.5 pl-2"
    :class="
      row.side === null
        ? 'border-l-transparent'
        : mine
          ? 'border-l-primary bg-primary/10'
          : 'border-l-foreground bg-foreground/5'
    "
    data-testid="timeline-row"
  >
    <component :is="mark" v-if="mark" class="text-muted-foreground size-3.5" aria-hidden="true" />
    <span v-else />

    <SpeciesIcon
      v-if="row.species"
      :id="toID(row.species)"
      :label="speciesName(toID(row.species))"
      :size="26"
    />
    <span v-else />

    <span class="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
      <span v-if="row.move" class="font-medium">{{ row.move }}</span>

      <!-- Whatever the row points at: a move's targets, or the Pokémon that came
           in for the one that left. -->
      <template v-if="row.targets.length">
        <span class="text-muted-foreground" aria-hidden="true">→</span>
        <SpeciesIcon
          v-for="(target, index) of row.targets"
          :key="`${target}-${index}`"
          :id="toID(target)"
          :label="speciesName(toID(target))"
          :size="row.mark === 'switch' ? 26 : 20"
        />
      </template>

      <BattleHealthChange v-if="row.health" :health="row.health" />

      <!-- Beside the message rather than instead of it: a Pokémon switching
           back in carries both ("came in" and the `tox` it arrived with), and
           the condition is the half the log only states here. -->
      <span
        v-if="row.status"
        class="text-destructive border-destructive/50 rounded border px-1 font-mono text-[10px] uppercase"
      >
        {{ row.status }}
      </span>

      <span
        v-if="message"
        :class="
          row.quiet
            ? 'sr-only'
            : row.tone === 'bad'
              ? 'text-destructive'
              : row.tone === 'accent'
                ? 'text-chart-3'
                : 'text-muted-foreground'
        "
      >
        {{ message }}
      </span>
    </span>
  </div>
</template>
