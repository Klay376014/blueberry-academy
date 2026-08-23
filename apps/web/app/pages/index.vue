<script setup lang="ts">
/**
 * The dashboard. Summary first, then the teams behind it — "how am I doing
 * lately" and "because of which team" are two faces of one question, so they
 * share a page and one set of filters (design document §7).
 *
 * The win rate curve belongs between them and is #16.
 */
const { t } = useI18n()
const localePath = useLocalePath()
const user = useCurrentUser()

const {
  teams,
  overall,
  battles,
  formatOptions,
  identityOptions,
  serverFilterKey,
  loading,
  error,
  loaded,
  load,
} = useStats()

// Awaited in setup, so the first paint carries the numbers rather than an
// empty state that turns into them a tick later. Guarded on the user because
// setup runs before the route middleware has bounced a signed-out visitor.
if (user.value && !loaded.value) await load()

// Only the filters the database applies; the rest are recomputed in place.
watch(serverFilterKey, () => load())

const strongest = computed(() => teams.value[0])
</script>

<template>
  <main class="flex flex-col gap-6 py-8">
    <div>
      <h1 class="text-3xl font-semibold tracking-tight">{{ t('home.title') }}</h1>
      <p class="mt-2 text-muted-foreground">{{ t('home.tagline') }}</p>
    </div>

    <StatsFilterBar :formats="formatOptions" :identities="identityOptions" />

    <p v-if="error" class="text-sm text-destructive" data-testid="stats-error">
      {{ t('teams.failed') }}
    </p>

    <p v-else-if="loading && !loaded" class="text-sm text-muted-foreground">
      {{ t('teams.loading') }}
    </p>

    <section
      v-else-if="!battles.length"
      class="rounded-lg border border-border p-6"
      :aria-label="t('teams.title')"
    >
      <p class="text-muted-foreground">{{ t('teams.empty') }}</p>
      <NuxtLink :to="localePath('/import')" class="mt-2 inline-block text-primary underline">
        {{ t('teams.emptyAction') }}
      </NuxtLink>
    </section>

    <template v-else>
      <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" :aria-label="t('summary.title')">
        <div class="rounded-lg border border-border bg-card p-3">
          <span class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            {{ t('summary.games') }}
          </span>
          <p class="font-mono text-3xl tabular-nums" data-testid="summary-games">
            {{ overall.games }}
          </p>
        </div>

        <div class="rounded-lg border border-border bg-card p-3">
          <span class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            {{ t('summary.winRate') }}
          </span>
          <p class="font-mono text-3xl tabular-nums" data-testid="summary-rate">
            {{ Math.round(overall.winRate * 100) }}%
          </p>
          <p class="font-mono text-[11px] text-muted-foreground tabular-nums">
            {{ overall.wins }}–{{ overall.losses }}
          </p>
        </div>

        <div v-if="strongest" class="rounded-lg border border-border bg-card p-3 sm:col-span-2">
          <span class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            {{ t('summary.strongest') }}
          </span>
          <div class="mt-1 flex items-center justify-between gap-3">
            <SpeciesParty :signature="strongest.signature" :size="22" />
            <span class="font-mono text-lg tabular-nums">
              {{ strongest.tally.wins }}–{{ strongest.tally.losses }}
            </span>
          </div>
        </div>
      </section>

      <section class="flex flex-col gap-3" :aria-label="t('teams.title')">
        <div class="flex items-baseline justify-between gap-3">
          <h2 class="text-xl font-semibold tracking-tight">{{ t('teams.title') }}</h2>
          <p class="font-mono text-xs text-muted-foreground tabular-nums">{{ teams.length }}</p>
        </div>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatsTeamCard v-for="team of teams" :key="team.formatId + team.signature" :team />
        </div>
      </section>
    </template>
  </main>
</template>
