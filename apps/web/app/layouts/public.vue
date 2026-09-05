<script setup lang="ts">
/**
 * The shell a stranger sees: the landing page, about, privacy and terms, and
 * the login. No sign-out button, and no link to the two pages that need an
 * account (issue #125).
 *
 * `/` is in the nav for both readers: it answers each of them in its own way
 * — landing content for a stranger, the dashboard for somebody signed in
 * (issue #126).
 */
const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <SiteShell>
    <template #nav>
      <SiteNavLink :to="localePath('/')">{{ t('nav.home') }}</SiteNavLink>
      <SiteNavLink :to="localePath('/about')">{{ t('nav.about') }}</SiteNavLink>
    </template>

    <slot />
  </SiteShell>
</template>
