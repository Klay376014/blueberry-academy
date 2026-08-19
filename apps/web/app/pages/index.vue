<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <main class="py-8">
    <h1 class="text-3xl font-semibold tracking-tight">{{ t('home.title') }}</h1>
    <p class="mt-2 text-muted-foreground">{{ t('home.tagline') }}</p>
  </main>
</template>
