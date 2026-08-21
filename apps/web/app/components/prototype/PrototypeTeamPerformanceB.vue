<script setup lang="ts">
// PROTOTYPE variant B — master/detail. A narrow list on the left, one team's
// full story on the right. No expanding rows: the drill-down has the whole
// pane, so the unaccounted games can be a labelled segment of a bar rather
// than a sentence in a footnote.
import { TEAMS, incompleteGames, wilsonLower, winRate } from './teamPerformance'

const series = ref<'all' | 'bo1' | 'bo3'>('all')
const selectedKey = ref('calyrex-ladder')

const list = computed(() =>
  TEAMS.filter((t) => series.value === 'all' || t.series === series.value).sort(
    (a, b) => wilsonLower(b.wins, b.games) - wilsonLower(a.wins, a.games),
  ),
)

const selected = computed(
  () => list.value.find((t) => t.key === selectedKey.value) ?? list.value[0],
)

const pct = (n: number) => `${Math.round(n * 100)}%`

/** Bring games, then the unaccounted remainder, as percentages of the team's games. */
const segments = computed(() => {
  const team = selected.value
  if (!team) return []
  const named = team.brings.map((bring) => ({
    label: bring.bring.map((id) => speciesName(id)).join(' · '),
    games: bring.games,
    wins: bring.wins,
    complete: true,
  }))
  return [
    ...named,
    { label: 'No complete bring recorded', games: incompleteGames(team), wins: 0, complete: false },
  ].filter((s) => s.games > 0)
})
</script>

<template>
  <section class="mt-10">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <h2 class="text-xl font-semibold tracking-tight">Team performance</h2>
      <div class="flex overflow-hidden rounded-md border border-border text-sm">
        <button
          v-for="option of ['all', 'bo1', 'bo3'] as const"
          :key="option"
          type="button"
          class="px-3 py-1.5 uppercase"
          :class="series === option ? 'bg-foreground text-background' : 'hover:bg-accent'"
          @click="() => (series = option)"
        >
          {{ option }}
        </button>
      </div>
    </div>

    <div class="mt-4 grid gap-6 lg:grid-cols-[20rem_1fr]">
      <ul class="space-y-1">
        <li v-for="team of list" :key="team.key">
          <button
            type="button"
            class="w-full rounded-lg border px-3 py-2.5 text-left transition-colors"
            :class="
              team.key === selected?.key
                ? 'border-foreground bg-accent'
                : 'border-border hover:bg-accent/50'
            "
            @click="() => (selectedKey = team.key)"
          >
            <div class="flex items-center gap-0.5">
              <PrototypeSpeciesIcon v-for="id of team.team" :id="id" :key="id" size="sm" />
            </div>
            <div class="mt-1.5 flex items-baseline justify-between text-sm">
              <span class="tabular-nums">{{ team.wins }}–{{ team.games - team.wins }}</span>
              <span class="text-xs text-muted-foreground uppercase">{{ team.series }}</span>
            </div>
            <div class="mt-1 h-1 w-full rounded-full bg-muted">
              <div
                class="h-1 rounded-full bg-foreground"
                :style="{ width: pct(wilsonLower(team.wins, team.games)) }"
              />
            </div>
          </button>
        </li>
      </ul>

      <div v-if="selected" class="rounded-lg border border-border p-5">
        <div class="flex flex-wrap items-center gap-1">
          <PrototypeSpeciesIcon v-for="id of selected.team" :id="id" :key="id" />
        </div>
        <p class="mt-2 font-mono text-xs text-muted-foreground">{{ selected.format }}</p>

        <dl class="mt-5 grid grid-cols-3 gap-4 border-y border-border py-4">
          <div>
            <dt class="text-xs text-muted-foreground uppercase">Games</dt>
            <dd class="mt-0.5 text-2xl font-semibold tabular-nums">{{ selected.games }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted-foreground uppercase">Win rate</dt>
            <dd class="mt-0.5 text-2xl font-semibold tabular-nums">
              {{ pct(winRate(selected.wins, selected.games)) }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted-foreground uppercase">Wilson lower</dt>
            <dd class="mt-0.5 text-2xl font-semibold tabular-nums">
              {{ pct(wilsonLower(selected.wins, selected.games)) }}
            </dd>
          </div>
        </dl>

        <h3 class="mt-5 text-sm font-medium">Where the {{ selected.games }} games went</h3>
        <div class="mt-2 flex h-4 w-full overflow-hidden rounded-md">
          <div
            v-for="segment of segments"
            :key="segment.label"
            class="h-4"
            :class="
              segment.complete
                ? 'bg-foreground/80 outline-1 -outline-offset-1 outline-background'
                : 'bg-muted-foreground/25 [background-image:repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(0,0,0,0.25)_3px,rgba(0,0,0,0.25)_6px)]'
            "
            :style="{ width: pct(segment.games / selected.games) }"
            :title="`${segment.label} — ${segment.games}`"
          />
        </div>
        <p class="mt-2 text-xs text-muted-foreground">
          The hatched slice is {{ incompleteGames(selected) }} games that ended before every pick
          had appeared. There is no complete bring to file them under, so they show up here and in
          the team's record but in none of the brings below.
        </p>

        <ul class="mt-4 divide-y divide-border">
          <li
            v-for="bring of selected.brings"
            :key="bring.bring.join()"
            class="flex items-center justify-between gap-4 py-2.5"
          >
            <div class="flex items-center gap-0.5">
              <PrototypeSpeciesIcon v-for="id of bring.bring" :id="id" :key="id" />
            </div>
            <div class="flex items-center gap-4 text-sm">
              <span class="tabular-nums">{{ bring.wins }}–{{ bring.games - bring.wins }}</span>
              <span class="w-10 text-right tabular-nums">
                {{ pct(winRate(bring.wins, bring.games)) }}
              </span>
              <div class="h-1.5 w-24 rounded-full bg-muted">
                <div
                  class="h-1.5 rounded-full bg-foreground/60"
                  :style="{ width: pct(wilsonLower(bring.wins, bring.games)) }"
                />
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
