<script setup lang="ts">
/**
 * About sits on both sides of the login, so the shell it is drawn in is the
 * `shell` middleware's to pick — see `app/middleware/shell.ts` (issue #125,
 * #126). The `layout` here is what a reader with no session gets.
 */
definePageMeta({
  layout: 'public',
  middleware: ['shell'],
})

const { t } = useI18n()

/**
 * What this page says about itself where it is pasted rather than opened. It
 * reaches a crawler at all because this address is prerendered at build time:
 * see `routeRules` in nuxt.config.ts and the follow-up note on ADR-0001
 * (issue #130).
 */
useShareMeta({
  title: () => t('seo.about.title'),
  description: () => t('seo.about.description'),
})
</script>

<template>
  <MarketingAboutPage />
</template>
