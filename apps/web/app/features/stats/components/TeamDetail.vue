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
 *
 * Where "wide enough" is, is `md` and not `lg` (issue #216): a rail of 14rem
 * plus the card still leaves 768 more room than the card alone needs, and the
 * reader at that width did not necessarily arrive from the dashboard list —
 * that was a phone's story. See docs/specs/2026-09-18-responsive-baseline.md §3.
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
          class="inline-flex min-h-11 items-center rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          data-testid="back"
        >
          ‹ {{ t('teams.back') }}
        </NuxtLink>

        <nav
          v-if="team"
          class="ml-auto flex items-center gap-2 md:hidden"
          :aria-label="t('teams.step')"
          data-testid="team-stepper"
        >
          <NuxtLink
            v-if="previous"
            :to="previous"
            class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
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
            class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
            :aria-label="t('teams.next')"
            data-testid="step-next"
          >
            ›
          </NuxtLink>
        </nav>
      </div>

      <div
        v-if="team"
        class="grid gap-5 md:grid-cols-[minmax(0,14rem)_1fr] lg:grid-cols-[minmax(0,18rem)_1fr]"
        data-testid="team-layout"
      >
        <!-- The ranking, still there to compare against. A sidebar appearing
             is a layout telling another story, so it is a prefix rather than a
             wrap (§4). 14rem is what a dense card's six icons need; `lg` only
             widens it. -->
        <nav
          class="hidden flex-col gap-2 md:flex"
          :aria-label="t('teams.title')"
          data-testid="team-rail"
        >
          <StatsTeamCard
            v-for="entry of teams"
            :key="entry.formatId + entry.signature"
            :team="entry"
            dense
            :current="entry === team"
          />
        </nav>

        <!-- `min-w-0`: the `1fr` column would otherwise take its width from
             the widest thing in it rather than from what is left. -->
        <article class="flex min-w-0 flex-col gap-5 rounded-lg border border-border bg-card p-4">
          <header class="flex flex-wrap items-center gap-3" data-testid="team-header">
            <!-- 39 rather than 48: at 320 the card's interior is 254px (shell
                 `px-4`, the border, `p-4`), and six of these with their
                 `gap-px` come to 239. At 48 they came to 293 and wrapped. -->
            <SpeciesParty :signature="team.signature" :size="39" />
            <span
              class="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            >
              {{ bestOfLabel(team.formatId) }}
            </span>
            <p class="w-full font-mono text-xs text-muted-foreground">{{ team.formatId }}</p>
          </header>

          <!-- Container-driven rather than a prefix (§4): from `md` the rail
               takes a column, so this card is narrower at 768 than at 640 and
               a viewport-keyed column count would claim width it has not got.
               8rem is the floor a tile's label and its numeral need. -->
          <dl
            class="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3"
            data-testid="team-stats"
          >
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
                <!-- 36 inside the bring's own border and `p-2`, which leave
                     236px at 320 — three short of what six at 39 need. -->
                <SpeciesParty :signature="team.signature" :bring="bring.signature" :size="36" />
                <span class="font-mono tabular-nums">
                  {{ bring.tally.wins }}–{{ bring.tally.losses }}
                </span>
              </div>
              <div class="flex items-center gap-3">
                <span class="font-mono text-[11px] text-muted-foreground tabular-nums">
                  {{ t('teams.sample', { games: bring.tally.games }) }}
                </span>
                <!-- A share of the row rather than 8rem of it: the row is as
                     wide as the card, and the card is one of two columns from
                     `md`. Capped so it stays a bar and not a second chart. -->
                <div
                  class="ml-auto h-1.5 w-1/3 max-w-32 min-w-12 overflow-hidden rounded-full bg-muted"
                  :title="t('teams.ranking', { score: Math.round(bring.tally.score * 100) })"
                  data-testid="bring-rank"
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
