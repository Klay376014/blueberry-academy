<script setup lang="ts">
import { ArrowRightLeft, Gem, HeartPulse, Skull, Sparkles, Zap } from '@lucide/vue'
import { toID } from 'replay-parser'
import type { SideId } from 'replay-parser'
import type { TimelineRow } from '../utils/timelineRows'
import { speciesDisplayName, speciesLabel } from '~/shared/utils/speciesName'

/**
 * One thing that happened, on one line.
 *
 * The Pokémon is its icon and nothing else: an icon reads the same in every
 * locale, and the name it stands for is on it as a label rather than beside it
 * — in the reader's language, with the English name Showdown shows kept beside
 * it (docs/adr/0014-localised-species-names.md). The move keeps its English
 * name, which has no icon to become.
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

const { t, locale } = useI18n()

/** The reader's name for a species, and the icon's fuller label for it. */
const named = (species: string | undefined) =>
  species === undefined ? '' : speciesDisplayName(toID(species), locale.value)
const labelled = (species: string) => speciesLabel(toID(species), locale.value)

/**
 * The row in words. The names are passed in as parameters because the icons
 * carry them visually and a screen reader has no icon to read: `pokemon` is the
 * row's subject and `into` whatever it points at.
 */
const message = computed(() => {
  const said = props.row.message
  if (!said) return null

  return t(`battle.event.${said.key}`, {
    ...said.params,
    pokemon: named(props.row.species ?? undefined),
    into: named(props.row.targets[0]?.species),
  })
})
</script>

<template>
  <!-- Whose row this is, in colour rather than in words: the ink of the theme
       against its accent, plus a wash of each so a row reads as one side's at a
       glance rather than by looking at the rail. -->
  <div
    class="grid grid-cols-[14px_40px_1fr] items-center gap-2 rounded-sm border-l-2 py-0.5 pr-1.5 pl-2"
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
      :label="labelled(row.species)"
      :size="40"
    />
    <span v-else />

    <span class="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
      <span v-if="row.move" class="font-medium">{{ row.move }}</span>

      <!-- What the move did to the Pokémon using it: a Protect that went up, a
           swing that missed. -->
      <BattleRowNotes :notes="row.notes" />

      <!-- Whatever the row points at: a move's targets, or the Pokémon that came
           in for the one that left. -->
      <template v-if="row.targets.length">
        <span class="text-muted-foreground" aria-hidden="true">→</span>
        <span
          v-for="(target, index) of row.targets"
          :key="`${target.species}-${index}`"
          class="flex items-center gap-1"
        >
          <SpeciesIcon
            :id="toID(target.species)"
            :label="labelled(target.species)"
            :size="row.mark === 'switch' ? 40 : 30"
          />
          <BattleRowNotes :notes="target.notes" />
          <BattleRowHealth
            v-for="(change, hit) of target.health"
            :key="`${change.kind}-${change.hpAfter}-${hit}`"
            :change
          />
        </span>
      </template>

      <!-- Whoever else the action reached, and not behind the arrow: the one
           that stopped a spread move was never listed as a target of it. The
           dot is what keeps it from reading as one more target. -->
      <span v-if="row.bystanders.length" class="text-muted-foreground" aria-hidden="true">·</span>
      <span
        v-for="(bystander, index) of row.bystanders"
        :key="`${bystander.species}-${index}`"
        class="flex items-center gap-1"
      >
        <SpeciesIcon
          :id="toID(bystander.species)"
          :label="labelled(bystander.species)"
          :size="30"
        />
        <BattleRowNotes :notes="bystander.notes" />
      </span>

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
