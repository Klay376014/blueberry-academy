<script setup lang="ts">
import { parseTeamRouteId, teamRouteId } from '../utils/teamRoute'
import { bestOfLabel } from '~/shared/utils/formatLabel'
import { rateFill } from '../utils/rateFill'

/**
 * One team, all of it.
 *
 * Wide enough and the ranked list stays alongside, which is what makes it
 * possible to compare four teams without going back each time. On a phone the
 * list is the dashboard the reader just came from, so it gives way to a
 * stepper that walks the same ranking.
 */
const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()

const { teams, aggregate: unit, loading, error, loaded, whenLoaded, focusTeam } = useStats()

await whenLoaded()

const wanted = computed(() => parseTeamRouteId(String(route.params.id ?? '')))

// The address carries the team's format, and the format is a required filter:
// arriving here with another one chosen would find no team and say so.
watch(wanted, focusTeam, { immediate: true })

const index = computed(() =>
  teams.value.findIndex(
    (team) => team.formatId === wanted.value?.formatId && team.signature === wanted.value.signature,
  ),
)

const team = computed(() => (index.value === -1 ? null : teams.value[index.value]))

/** The neighbours in the ranking, which is the order the dashboard showed. */
function stepTo(offset: number) {
  const next = teams.value[index.value + offset]
  if (!next) return null

  return localePath(
    `/teams/${encodeURIComponent(teamRouteId({ formatId: next.formatId, signature: next.signature }))}`,
  )
}

const previous = computed(() => stepTo(-1))
const next = computed(() => stepTo(1))
</script>

<template>
  <main class="flex flex-col gap-5 py-6">
    <p v-if="error" class="text-sm text-destructive">{{ t('teams.failed') }}</p>
    <p v-else-if="loading && !loaded" class="text-sm text-muted-foreground">
      {{ t('teams.loading') }}
    </p>

    <template v-else>
      <div class="flex items-center gap-3">
        <NuxtLink
          :to="localePath('/')"
          class="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          data-testid="back"
        >
          ‹ {{ t('teams.back') }}
        </NuxtLink>

        <nav
          v-if="team"
          class="ml-auto flex items-center gap-1 lg:hidden"
          :aria-label="t('teams.step')"
        >
          <NuxtLink
            v-if="previous"
            :to="previous"
            class="rounded-md px-2 py-1 text-muted-foreground hover:bg-accent"
            :aria-label="t('teams.previous')"
            data-testid="step-previous"
          >
            ‹
          </NuxtLink>
          <span class="font-mono text-xs text-muted-foreground tabular-nums">
            {{ index + 1 }}/{{ teams.length }}
          </span>
          <NuxtLink
            v-if="next"
            :to="next"
            class="rounded-md px-2 py-1 text-muted-foreground hover:bg-accent"
            :aria-label="t('teams.next')"
            data-testid="step-next"
          >
            ›
          </NuxtLink>
        </nav>
      </div>

      <div v-if="team" class="grid gap-5 lg:grid-cols-[minmax(0,18rem)_1fr]">
        <!-- The ranking, still there to compare against. Off a phone only:
             on one, the reader came from exactly this list. -->
        <nav class="hidden flex-col gap-2 lg:flex" :aria-label="t('teams.title')">
          <StatsTeamCard
            v-for="entry of teams"
            :key="entry.formatId + entry.signature"
            :team="entry"
            dense
            :current="entry === team"
          />
        </nav>

        <article class="flex flex-col gap-5 rounded-lg border border-border bg-card p-4">
          <header class="flex flex-wrap items-center gap-3">
            <SpeciesParty :signature="team.signature" :size="48" />
            <span
              class="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            >
              {{ bestOfLabel(team.formatId) }}
            </span>
            <p class="w-full font-mono text-xs text-muted-foreground">{{ team.formatId }}</p>
          </header>

          <dl class="grid grid-cols-2 gap-3">
            <div class="rounded-md border border-border p-2">
              <dt class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                {{ t(unit === 'series' ? 'teams.seriesCount' : 'teams.games') }}
              </dt>
              <dd class="font-mono text-2xl tabular-nums" data-testid="team-games">
                {{ team.tally.games }}
              </dd>
            </div>
            <div class="rounded-md border border-border p-2">
              <dt class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                {{ t('teams.winRate') }}
              </dt>
              <dd class="font-mono text-2xl tabular-nums">
                {{ Math.round(team.tally.winRate * 100) }}%
              </dd>
            </div>
          </dl>

          <StatsAccountingBar :team />

          <section class="flex flex-col gap-2">
            <h3 class="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
              {{ t('teams.brings', { count: team.brings.length }) }}
            </h3>

            <p v-if="!team.brings.length" class="text-sm text-muted-foreground">
              {{ t('teams.noBrings') }}
            </p>

            <div
              v-for="bring of team.brings"
              :key="bring.signature"
              class="flex flex-col gap-2 rounded-md border border-border p-2"
              data-testid="bring"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <SpeciesParty :signature="bring.signature" :size="39" />
                <span class="font-mono tabular-nums">
                  {{ bring.tally.wins }}–{{ bring.tally.losses }}
                </span>
              </div>
              <div class="flex items-center gap-3">
                <span class="font-mono text-[11px] text-muted-foreground tabular-nums">
                  {{ t('teams.sample', { games: bring.tally.games }) }}
                </span>
                <div
                  class="ml-auto h-1.5 w-32 overflow-hidden rounded-full bg-muted"
                  :title="t('teams.ranking', { score: Math.round(bring.tally.score * 100) })"
                >
                  <div
                    class="h-full rounded-full"
                    :style="{
                      width: `${bring.tally.score * 100}%`,
                      background: rateFill(bring.tally.winRate),
                    }"
                  />
                </div>
              </div>
            </div>
          </section>
        </article>
      </div>

      <p
        v-else
        class="rounded-lg border border-border p-6 text-muted-foreground"
        data-testid="team-missing"
      >
        {{ t('teams.notFound') }}
      </p>
    </template>
  </main>
</template>
