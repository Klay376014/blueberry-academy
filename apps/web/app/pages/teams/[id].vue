<script setup lang="ts">
definePageMeta({ layout: 'app' })

const { t } = useI18n()

// The section it belongs to rather than the team it is showing: the team's own
// name is six species long, and a tab has no room for it.
useHead({ title: () => t('teams.title') })
</script>

<template>
  <StatsTeamDetail />
</template>
