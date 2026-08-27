<script setup lang="ts">
import type { TeamStats } from '../utils/battleStats'
import { rateFill } from '../utils/rateFill'
import { speciesName } from '~/shared/utils/speciesName'

/**
 * Where a team's games went: one segment per complete bring, and a hatched
 * tail for the games that belong to no bring at all.
 *
 * This bar is the reason the detail page exists. The bring rows below it do
 * not add up to the team's own game count — an early forfeit leaves a pick
 * having never appeared, so that game has no complete bring to be filed under
 * while still counting for the team. Said in a footnote it reads as an
 * arithmetic error; drawn as a slice of the whole, it reads as what it is.
 */
const props = defineProps<{ team: TeamStats }>()

const { t } = useI18n()

const unfiled = computed(
  () => props.team.tally.games - props.team.brings.reduce((sum, b) => sum + b.tally.games, 0),
)

const segments = computed(() =>
  props.team.brings.map((bring) => ({
    signature: bring.signature,
    width: (bring.tally.games / props.team.tally.games) * 100,
    fill: rateFill(bring.tally.winRate),
    label: t('teams.segment', {
      bring: bring.signature.split('|').map(speciesName).join(', '),
      games: bring.tally.games,
      rate: Math.round(bring.tally.winRate * 100),
    }),
  })),
)
</script>

<template>
  <section class="flex flex-col gap-2" data-testid="accounting">
    <div class="flex h-3 gap-0.5 overflow-hidden rounded">
      <div
        v-for="segment of segments"
        :key="segment.signature"
        class="h-full"
        :style="{ width: `${segment.width}%`, background: segment.fill }"
        :title="segment.label"
      />
      <div
        v-if="unfiled > 0"
        class="bg-unfiled-hatch h-full"
        :style="{ width: `${(unfiled / team.tally.games) * 100}%` }"
        :title="t('teams.unfiledShort', { games: unfiled })"
        data-testid="unfiled-slice"
      />
    </div>

    <div v-if="unfiled > 0" class="flex items-start gap-2" data-testid="unfiled-note">
      <span class="font-mono text-xs text-muted-foreground tabular-nums">
        {{ t('teams.unfiledShort', { games: unfiled }) }}
      </span>
      <InfoHint :label="t('teams.whatIsThis')">{{ t('teams.unfiled') }}</InfoHint>
    </div>
  </section>
</template>
