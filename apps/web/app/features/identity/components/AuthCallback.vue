<script setup lang="ts">
// Where Google sends the browser back to. Public, because it runs before a
// session exists — see app/middleware/auth.global.ts.
const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const { completeSignIn } = useAuth()

const failed = ref(false)

onMounted(async () => {
  const code = route.query.code
  if (typeof code !== 'string' || code === '') {
    // Reached without a code: a stale bookmark, or Google declined and sent an
    // error back instead.
    failed.value = true
    return
  }

  try {
    await completeSignIn(code)
    await navigateTo(localePath('/'))
  } catch {
    // The code was missing, already spent, or refused. Saying so beats
    // leaving a spinner turning over nothing.
    failed.value = true
  }
})
</script>

<template>
  <main class="py-8">
    <h1 v-if="failed" class="text-3xl font-semibold tracking-tight">
      {{ t('login.failed') }}
    </h1>
    <p v-else class="text-muted-foreground" data-testid="callback-pending">
      {{ t('login.completing') }}
    </p>

    <NuxtLink
      v-if="failed"
      :to="localePath('/login')"
      class="mt-4 inline-block underline"
      data-testid="callback-retry"
    >
      {{ t('login.retry') }}
    </NuxtLink>
  </main>
</template>
