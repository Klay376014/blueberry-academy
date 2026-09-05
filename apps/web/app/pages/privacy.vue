<script setup lang="ts">
/**
 * Readable with or without an account, so the shell is the `shell`
 * middleware's to pick — see `app/middleware/shell.ts` (issue #127).
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
  title: () => t('seo.privacy.title'),
  description: () => t('seo.privacy.description'),
})
</script>

<template>
  <MarketingPrivacyPage />
</template>
