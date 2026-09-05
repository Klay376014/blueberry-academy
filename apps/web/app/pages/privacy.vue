<script setup lang="ts">
/**
 * Readable with or without an account, so the shell is the `shell`
 * middleware's to pick — see `app/middleware/shell.ts` (issue #127).
 */
definePageMeta({
  layout: 'public',
  middleware: ['shell'],
})
</script>

<template>
  <MarketingPrivacyPage />
</template>
