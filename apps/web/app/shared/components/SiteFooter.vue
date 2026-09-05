<script setup lang="ts">
/**
 * The bottom of every page: what this keeps of yours, what it promises, whose
 * code it is, and which language you read it in (issue #128).
 *
 * The same on both sides of the login. A reader who is signed in has the same
 * right to reach the privacy page as the stranger who has not handed anything
 * over yet, and it is not in the header for either of them.
 */
const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <footer
    class="mt-12 flex flex-col gap-3 border-t border-border py-4 sm:flex-row sm:items-center sm:justify-between"
    data-testid="site-footer"
  >
    <nav
      class="flex flex-wrap items-center gap-x-2 gap-y-1"
      :aria-label="t('a11y.footerNav')"
      data-testid="site-footer-nav"
    >
      <SiteNavLink :to="localePath('/about')">{{ t('footer.about') }}</SiteNavLink>
      <SiteNavLink :to="localePath('/privacy')">{{ t('footer.privacy') }}</SiteNavLink>

      <!-- The terms are a section of the privacy page rather than a page of
           their own: both say what is true of the same data. -->
      <SiteNavLink :to="`${localePath('/privacy')}#terms`">{{ t('footer.terms') }}</SiteNavLink>

      <!-- Written out rather than bound: it is the address of this repository,
           not a value the page computes. The same literal is on the privacy
           page, which is where a deletion is asked for. -->
      <a
        href="https://github.com/Klay376014/blueberry-academy"
        class="inline-flex min-h-11 items-center rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        target="_blank"
        rel="noopener noreferrer"
        data-testid="footer-source"
      >
        {{ t('footer.source') }}
      </a>
    </nav>

    <SiteLocaleSwitcher />
  </footer>
</template>
