<script setup lang="ts">
/**
 * What this reads and how it counts (issue #127).
 *
 * The vocabulary is CONTEXT.md's — game, series, team, bring, spectated — and
 * every claim here is one the dashboard actually makes: the unit follows the
 * format because `aggregateFor` reads it off the format id, and the ranking is
 * the Wilson lower bound because that is the sort key.
 */
const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <main class="flex flex-col gap-10 py-12">
    <div class="flex max-w-2xl flex-col gap-3">
      <h1 class="text-4xl font-semibold tracking-tight">{{ t('about.title') }}</h1>
      <p class="text-lg text-muted-foreground">{{ t('about.lede') }}</p>
    </div>

    <MarketingProseSection :title="t('about.source.title')" data-testid="about-source">
      <p class="text-muted-foreground">{{ t('about.source.body') }}</p>
    </MarketingProseSection>

    <MarketingProseSection :title="t('about.counting.title')" data-testid="about-counting">
      <p class="text-muted-foreground">{{ t('about.counting.unit') }}</p>
      <p class="text-muted-foreground">{{ t('about.counting.format') }}</p>
      <p class="text-muted-foreground">{{ t('about.counting.spectated') }}</p>
    </MarketingProseSection>

    <MarketingProseSection :title="t('about.teams.title')" data-testid="about-teams">
      <p class="text-muted-foreground">{{ t('about.teams.team') }}</p>
      <p class="text-muted-foreground">{{ t('about.teams.bring') }}</p>
    </MarketingProseSection>

    <MarketingProseSection :title="t('about.ranking.title')" data-testid="about-ranking">
      <p class="text-muted-foreground">{{ t('about.ranking.body') }}</p>
    </MarketingProseSection>

    <MarketingProseSection :title="t('about.limits.title')" data-testid="about-limits">
      <p class="text-muted-foreground">{{ t('about.limits.body') }}</p>

      <NuxtLink
        :to="localePath('/privacy')"
        class="text-primary underline"
        data-testid="about-privacy"
      >
        {{ t('about.privacy') }}
      </NuxtLink>
    </MarketingProseSection>
  </main>
</template>
