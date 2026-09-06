<script setup lang="ts">
definePageMeta({ layout: 'public' })

const { t } = useI18n()

// What this page is doing, which is the only thing it does.
useHead({ title: () => t('login.completing') })
</script>

<template>
  <IdentityAuthCallback />
</template>
