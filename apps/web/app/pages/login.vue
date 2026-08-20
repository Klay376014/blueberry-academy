<script setup lang="ts">
const { t } = useI18n()
const { signInWithGoogle } = useAuth()

const failed = ref(false)

async function signIn() {
  failed.value = false
  try {
    await signInWithGoogle()
  } catch {
    failed.value = true
  }
}
</script>

<template>
  <main class="py-8">
    <h1 class="text-3xl font-semibold tracking-tight">{{ t('login.title') }}</h1>
    <p class="mt-2 text-muted-foreground">{{ t('login.tagline') }}</p>

    <UiButton class="mt-6" data-testid="sign-in-google" @click="signIn">
      {{ t('login.google') }}
    </UiButton>

    <p v-if="failed" class="mt-4 text-sm text-destructive" data-testid="sign-in-error">
      {{ t('login.failed') }}
    </p>
  </main>
</template>
