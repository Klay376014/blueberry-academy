<script setup lang="ts">
import type { TeamStats } from '../../utils/battleStats'
import { bestOfLabel } from '../../utils/formatLabel'
import { teamRouteId } from '../../utils/teamRoute'

/**
 * One registered team, as a link to its detail page.
 *
 * The same card is the tile on the dashboard and the row in the detail page's
 * rail; `dense` is the only difference, so the two can never drift into
 * disagreeing about what a team looks like.
 *
 * The sample size travels with every card. No grouping is hidden for being
 * small — a team that vanished would only leave the user hunting for it — so
 * the number of games is what says how much to trust the bar.
 */
const props = defineProps<{ team: TeamStats; dense?: boolean; current?: boolean }>()

const { t } = useI18n()
const localePath = useLocalePath()

const to = computed(() =>
  localePath(
    `/teams/${encodeURIComponent(teamRouteId({ formatId: props.team.formatId, signature: props.team.signature }))}`,
  ),
)
</script>

<template>
  <NuxtLink
    :to
    class="flex flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:border-ring"
    :class="current ? 'border-ring bg-accent' : 'border-border'"
    :aria-current="current ? 'page' : undefined"
    data-testid="team-card"
  >
    <div class="flex items-center justify-between gap-2">
      <SpeciesParty :signature="team.signature" :size="dense ? 20 : 24" />
      <span class="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
        {{ bestOfLabel(team.formatId) }}
      </span>
    </div>

    <div class="flex items-baseline justify-between gap-2">
      <span class="font-mono tabular-nums" :class="dense ? 'text-lg' : 'text-2xl'">
        {{ team.tally.wins }}–{{ team.tally.losses }}
      </span>
      <span class="font-mono text-xs text-muted-foreground tabular-nums">
        {{ Math.round(team.tally.score * 100) }}%
      </span>
    </div>

    <div class="h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        class="h-full rounded-full bg-primary"
        :style="{ width: `${team.tally.score * 100}%` }"
      />
    </div>

    <p class="font-mono text-[11px] text-muted-foreground tabular-nums">
      {{
        t('teams.sample', { games: team.tally.games, score: Math.round(team.tally.score * 100) })
      }}
    </p>
  </NuxtLink>
</template>
