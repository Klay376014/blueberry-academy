<script setup lang="ts">
/**
 * The bottom of every page: what this keeps of yours, what it promises, whose
 * code it is, and which language you read it in (issue #128).
 *
 * The same on both sides of the login. A reader who is signed in has the same
 * right to reach the privacy page as the stranger who has not handed anything
 * over yet, and it is not in the header for either of them.
 *
 * No link to the source: the repository is not open to the people reading this
 * (issue #137), and `test/no-repo-links.spec.ts` keeps it that way.
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
    </nav>

    <SiteLocaleSwitcher />
  </footer>
</template>
