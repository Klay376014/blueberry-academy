<script setup lang="ts">
definePageMeta({ layout: 'public' })

const { t } = useI18n()

useHead({ title: () => t('login.title') })
</script>

<template>
  <IdentityLoginPage />
</template>
