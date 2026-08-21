<script setup lang="ts">
// PROTOTYPE (issue #17, throwaway): three variants of the team performance
// section, switchable via `?variant=`, mounted on the existing dashboard route
// so they are judged against the real header and page density. Fake data, no
// Supabase. Remove this and the components/prototype/ directory when a variant
// has won -- see the prototype/team-performance-ui branch.
const { t } = useI18n()
const route = useRoute()

const VARIANTS = [
  { key: 'A', name: 'Dense table, inline drill-down' },
  { key: 'B', name: 'Master/detail, accounting bar' },
  { key: 'C', name: 'Ranked cards, interval drawn' },
]

const variant = computed(() => String(route.query.variant ?? 'A').toUpperCase())
</script>

<template>
  <main class="py-8">
    <h1 class="text-3xl font-semibold tracking-tight">{{ t('home.title') }}</h1>
    <p class="mt-2 text-muted-foreground">{{ t('home.tagline') }}</p>

    <PrototypeTeamPerformanceA v-if="variant === 'A'" />
    <PrototypeTeamPerformanceB v-else-if="variant === 'B'" />
    <PrototypeTeamPerformanceC v-else-if="variant === 'C'" />

    <PrototypeSwitcher v-if="import.meta.dev" :variants="VARIANTS" :current="variant" />
  </main>
</template>
