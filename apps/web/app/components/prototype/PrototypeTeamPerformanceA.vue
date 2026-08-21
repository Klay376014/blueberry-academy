<script setup lang="ts">
// PROTOTYPE variant A — density first: one wide table, brings nested inside an
// expanded row. The bet is that a VGC player wants to scan many teams at once
// and only occasionally drills in.
import { TEAMS, incompleteGames, wilsonLower, winRate } from './teamPerformance'

const series = ref<'all' | 'bo1' | 'bo3'>('all')
const sortBy = ref<'wilson' | 'raw'>('wilson')
const expanded = ref<string | null>('miraidon-ladder')

const rows = computed(() =>
  TEAMS.filter((t) => series.value === 'all' || t.series === series.value).sort((a, b) =>
    sortBy.value === 'wilson'
      ? wilsonLower(b.wins, b.games) - wilsonLower(a.wins, a.games)
      : winRate(b.wins, b.games) - winRate(a.wins, a.games),
  ),
)

const pct = (n: number) => `${Math.round(n * 100)}%`

function toggle(key: string) {
  expanded.value = expanded.value === key ? null : key
}
</script>

<template>
  <section class="mt-10">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 class="text-xl font-semibold tracking-tight">Team performance</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          One row per registered team. Expand a row for the brings it actually picked.
        </p>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <div class="flex overflow-hidden rounded-md border border-border">
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
        <div class="flex overflow-hidden rounded-md border border-border">
          <button
            type="button"
            class="px-3 py-1.5"
            :class="sortBy === 'wilson' ? 'bg-foreground text-background' : 'hover:bg-accent'"
            @click="() => (sortBy = 'wilson')"
          >
            Wilson
          </button>
          <button
            type="button"
            class="px-3 py-1.5"
            :class="sortBy === 'raw' ? 'bg-foreground text-background' : 'hover:bg-accent'"
            @click="() => (sortBy = 'raw')"
          >
            Raw %
          </button>
        </div>
      </div>
    </div>

    <div class="mt-4 overflow-x-auto">
      <table class="w-full min-w-[52rem] text-sm">
        <thead
          class="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase"
        >
          <tr>
            <th class="py-2 pr-2 font-medium">Team</th>
            <th class="px-2 py-2 font-medium">Format</th>
            <th class="px-2 py-2 text-right font-medium">Games</th>
            <th class="px-2 py-2 text-right font-medium">W–L</th>
            <th class="px-2 py-2 text-right font-medium">Win rate</th>
            <th class="py-2 pl-2 font-medium">Wilson lower bound</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row of rows" :key="row.key">
            <tr
              class="cursor-pointer border-b border-border/60 hover:bg-accent/50"
              @click="() => toggle(row.key)"
            >
              <td class="py-2 pr-2">
                <div class="flex items-center gap-0.5">
                  <span class="w-4 text-muted-foreground">{{
                    expanded === row.key ? '▾' : '▸'
                  }}</span>
                  <PrototypeSpeciesIcon v-for="id of row.team" :id="id" :key="id" size="sm" />
                </div>
              </td>
              <td class="px-2 py-2 font-mono text-xs text-muted-foreground">{{ row.format }}</td>
              <td class="px-2 py-2 text-right tabular-nums">{{ row.games }}</td>
              <td class="px-2 py-2 text-right tabular-nums">
                {{ row.wins }}–{{ row.games - row.wins }}
              </td>
              <td class="px-2 py-2 text-right tabular-nums">
                {{ pct(winRate(row.wins, row.games)) }}
              </td>
              <td class="py-2 pl-2">
                <div class="flex items-center gap-2">
                  <div class="h-1.5 w-32 rounded-full bg-muted">
                    <div
                      class="h-1.5 rounded-full bg-foreground"
                      :style="{ width: pct(wilsonLower(row.wins, row.games)) }"
                    />
                  </div>
                  <span class="tabular-nums text-muted-foreground">
                    {{ pct(wilsonLower(row.wins, row.games)) }}
                  </span>
                </div>
              </td>
            </tr>

            <template v-if="expanded === row.key">
              <tr
                v-for="bring of row.brings"
                :key="bring.bring.join()"
                class="border-b border-border/40 bg-muted/30"
              >
                <td class="py-1.5 pr-2 pl-8">
                  <div class="flex items-center gap-0.5">
                    <PrototypeSpeciesIcon v-for="id of bring.bring" :id="id" :key="id" size="sm" />
                  </div>
                </td>
                <td class="px-2 py-1.5 text-xs text-muted-foreground">bring</td>
                <td class="px-2 py-1.5 text-right tabular-nums">{{ bring.games }}</td>
                <td class="px-2 py-1.5 text-right tabular-nums">
                  {{ bring.wins }}–{{ bring.games - bring.wins }}
                </td>
                <td class="px-2 py-1.5 text-right tabular-nums">
                  {{ pct(winRate(bring.wins, bring.games)) }}
                </td>
                <td class="py-1.5 pl-2">
                  <div class="flex items-center gap-2">
                    <div class="h-1.5 w-32 rounded-full bg-muted">
                      <div
                        class="h-1.5 rounded-full bg-foreground/60"
                        :style="{ width: pct(wilsonLower(bring.wins, bring.games)) }"
                      />
                    </div>
                    <span class="tabular-nums text-muted-foreground">
                      {{ pct(wilsonLower(bring.wins, bring.games)) }}
                    </span>
                  </div>
                </td>
              </tr>
              <tr class="border-b border-border/40 bg-muted/30">
                <td colspan="6" class="py-1.5 pl-8 text-xs text-muted-foreground">
                  Brings above account for {{ row.games - incompleteGames(row) }} of
                  {{ row.games }} games. The other {{ incompleteGames(row) }} ended before every
                  pick had appeared, so there is no complete bring to file them under — they still
                  count in the team's record.
                </td>
              </tr>
            </template>
          </template>
        </tbody>
      </table>
    </div>
  </section>
</template>
