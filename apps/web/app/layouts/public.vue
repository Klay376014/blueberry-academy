<script setup lang="ts">
/**
 * The shell a stranger sees: about, the login, and the landing page once
 * there is one. No sign-out button, and no link to the two pages that need an
 * account (issue #125).
 *
 * `/` is in the nav all the same, as it was before this shell existed: it is
 * the dashboard today, so a stranger pressing Home is sent on to the login —
 * one redirect rather than a link that is not there. #126 turns it into the
 * landing page, and then it is the right link for both readers.
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
