<script setup lang="ts">
/**
 * The dashboard. Recent form first, then the teams behind it — "how am I doing
 * lately" and "because of which team" are two faces of one question, so they
 * share a page and one set of filters (design document §7).
 *
 * The drawer this list opens is the timeline's and sits on the page beside
 * this component, not inside it (issue #61).
 */
const props = defineProps<{
  /**
   * The reader's alias list has been read and it is empty. Attribution is the
   * alias list re-derived (ADR-0012), so this account's every import is
   * spectated and this page stays empty however much lands in it (#129).
   *
   * A list that could not be read is not this: a reader sent off to bind a
   * name already on their profile, because a read failed, is worse off than
   * with the wording that was there before.
   */
  noNameBound: boolean
}>()

const { t } = useI18n()
const localePath = useLocalePath()

const {
  teams,
  battles,
  aggregate,
  units,
  overall,
  formatOptions,
  identityOptions,
  loading,
  error,
  loaded,
  whenLoaded,
} = useStats()

// Awaited in setup, so the first paint carries the numbers rather than an
// empty state that turns into them a tick later. When to read again is
// useStats's business.
await whenLoaded()

const strongest = computed(() => teams.value[0])

/**
 * The two ways to be empty, which need opposite next steps: filters that
 * matched nothing want the import page, and an account with no name bound has
 * nothing to match in the first place — importing more would file every one of
 * those the same way. Settled in one place so the three cannot come apart.
 */
const empty = computed(() =>
  props.noNameBound
    ? { said: 'teams.emptyUnbound', action: 'teams.emptyUnboundAction', to: '/settings' }
    : { said: 'teams.empty', action: 'teams.emptyAction', to: '/import' },
)
</script>

<template>
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
    data-testid="stats-empty"
  >
    <p class="text-muted-foreground">{{ t(empty.said) }}</p>
    <NuxtLink
      :to="localePath(empty.to)"
      class="mt-2 inline-block text-primary underline"
      data-testid="empty-action"
    >
      {{ t(empty.action) }}
    </NuxtLink>
  </section>

  <template v-else>
    <StatsTrendSection :battles :units :overall :aggregate />

    <StatsRecentList />

    <section class="flex flex-col gap-3" :aria-label="t('teams.title')">
      <div class="flex items-baseline justify-between gap-3">
        <h2 class="text-xl font-semibold tracking-tight">{{ t('teams.title') }}</h2>
        <p class="font-mono text-xs text-muted-foreground tabular-nums">{{ teams.length }}</p>
      </div>

      <div v-if="strongest" class="rounded-lg border border-border bg-card p-3">
        <span class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          {{ t('summary.strongest') }}
        </span>
        <div class="mt-1 flex flex-wrap items-center justify-between gap-3">
          <SpeciesParty :signature="strongest.signature" :size="33" />
          <span class="font-mono text-lg tabular-nums">
            {{ strongest.tally.wins }}–{{ strongest.tally.losses }}
          </span>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatsTeamCard v-for="team of teams" :key="team.formatId + team.signature" :team />
      </div>
    </section>
  </template>
</template>
