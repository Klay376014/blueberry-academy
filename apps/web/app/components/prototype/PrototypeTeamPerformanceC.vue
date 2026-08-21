<script setup lang="ts">
// PROTOTYPE variant C — no table at all. One card per team on a shared 0-100%
// axis, each showing its confidence interval as a bracket with the raw win rate
// as a dot inside it. The bet: if the interval is drawn, nobody has to be told
// why 3-0 ranks below 14-20 -- a three-game bracket is visibly enormous.
import { TEAMS, incompleteGames, wilsonLower, winRate } from './teamPerformance'

const series = ref<'all' | 'bo1' | 'bo3'>('all')
const openKey = ref<string | null>(null)

/** Wilson upper bound, so the card can draw the whole interval. */
function wilsonUpper(wins: number, games: number): number {
  if (games === 0) return 1
  const z = 1.96
  const p = wins / games
  const denominator = 1 + (z * z) / games
  const centre = p + (z * z) / (2 * games)
  const spread = z * Math.sqrt((p * (1 - p)) / games + (z * z) / (4 * games * games))
  return (centre + spread) / denominator
}

const cards = computed(() =>
  TEAMS.filter((t) => series.value === 'all' || t.series === series.value)
    .map((team) => ({
      team,
      lower: wilsonLower(team.wins, team.games),
      upper: wilsonUpper(team.wins, team.games),
      raw: winRate(team.wins, team.games),
    }))
    .sort((a, b) => b.lower - a.lower),
)

const pct = (n: number) => `${Math.round(n * 100)}%`

function toggle(key: string) {
  openKey.value = openKey.value === key ? null : key
}
</script>

<template>
  <section class="mt-10">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 class="text-xl font-semibold tracking-tight">Team performance</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Ranked by the low end of each team's interval. The dot is the win rate you actually got;
          the bar is where it could really sit.
        </p>
      </div>
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

    <div class="mt-1 flex justify-between px-1 text-[10px] text-muted-foreground tabular-nums">
      <span>0%</span>
      <span>50%</span>
      <span>100%</span>
    </div>

    <ol class="space-y-3">
      <li v-for="(card, position) of cards" :key="card.team.key">
        <div class="rounded-xl border border-border p-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <span class="w-5 text-sm text-muted-foreground tabular-nums">{{ position + 1 }}</span>
              <div class="flex items-center gap-0.5">
                <PrototypeSpeciesIcon v-for="id of card.team.team" :id="id" :key="id" />
              </div>
            </div>
            <div class="flex items-center gap-3 text-sm">
              <span class="rounded-full bg-muted px-2 py-0.5 text-xs uppercase">
                {{ card.team.series }}
              </span>
              <span class="tabular-nums">
                {{ card.team.games }} games · {{ card.team.wins }}–{{
                  card.team.games - card.team.wins
                }}
              </span>
            </div>
          </div>

          <div class="relative mt-3 h-6 rounded-md bg-muted/60">
            <div class="absolute inset-y-0 left-1/2 w-px bg-border" />
            <div
              class="absolute inset-y-1.5 rounded-sm bg-foreground/25"
              :style="{ left: pct(card.lower), width: pct(card.upper - card.lower) }"
            />
            <div
              class="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
              :style="{ left: pct(card.raw) }"
            />
          </div>
          <div class="mt-1.5 flex gap-4 text-xs text-muted-foreground tabular-nums">
            <span>raw {{ pct(card.raw) }}</span>
            <span>interval {{ pct(card.lower) }}–{{ pct(card.upper) }}</span>
            <button
              type="button"
              class="ml-auto underline underline-offset-2 hover:text-foreground"
              @click="() => toggle(card.team.key)"
            >
              {{ openKey === card.team.key ? 'hide brings' : `${card.team.brings.length} brings` }}
            </button>
          </div>

          <div v-if="openKey === card.team.key" class="mt-3 border-t border-border pt-3">
            <div class="flex flex-wrap gap-2">
              <div
                v-for="bring of card.team.brings"
                :key="bring.bring.join()"
                class="flex items-center gap-2 rounded-lg bg-muted/60 px-2 py-1.5"
              >
                <div class="flex items-center gap-0.5">
                  <PrototypeSpeciesIcon v-for="id of bring.bring" :id="id" :key="id" size="sm" />
                </div>
                <span class="text-xs tabular-nums">
                  {{ bring.wins }}–{{ bring.games - bring.wins }}
                </span>
              </div>
              <div
                class="flex items-center gap-2 rounded-lg border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground"
              >
                +{{ incompleteGames(card.team) }} games with no complete bring
              </div>
            </div>
          </div>
        </div>
      </li>
    </ol>
  </section>
</template>
