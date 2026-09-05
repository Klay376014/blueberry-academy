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
</script>

<template>
  <MarketingAboutPage />
</template>
