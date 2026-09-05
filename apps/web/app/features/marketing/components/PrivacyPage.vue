<script setup lang="ts">
/**
 * What this keeps of a reader's, and what it cannot check (issue #127).
 *
 * Written against the schema rather than against an intention: the row list is
 * `battles`, the log path is the `replay-logs` bucket, and "you and nobody
 * else" is the RLS policy in supabase/migrations, not a promise the app keeps
 * by being careful.
 */
const { t } = useI18n()

/**
 * When the prose below last changed. Here rather than in the two locale files,
 * so the date a reader is shown cannot depend on which language they read it
 * in — and so that changing it is one edit, next to the page it dates.
 */
const UPDATED = '2026-09-05'

const kept = ['account', 'names', 'battles', 'logs'] as const
</script>

<template>
  <main class="flex flex-col gap-10 py-12">
    <div class="flex max-w-2xl flex-col gap-3">
      <h1 class="text-4xl font-semibold tracking-tight">{{ t('privacy.title') }}</h1>
      <p class="text-lg text-muted-foreground">{{ t('privacy.lede') }}</p>
      <p class="text-xs text-muted-foreground">{{ t('privacy.updated', { date: UPDATED }) }}</p>
    </div>

    <MarketingProseSection :title="t('privacy.stored.title')" data-testid="privacy-stored">
      <!-- Real markers rather than a drawn stand-in: Tailwind's preflight
           takes them off, and a list styled to `list-style: none` stops being
           a list to VoiceOver — on the page whose four items are the point. -->
      <ul class="flex list-disc flex-col gap-3 pl-5 marker:text-muted-foreground">
        <li v-for="item in kept" :key="item" class="text-muted-foreground">
          {{ t(`privacy.stored.${item}`) }}
        </li>
      </ul>
    </MarketingProseSection>

    <MarketingProseSection :title="t('privacy.access.title')" data-testid="privacy-access">
      <p class="text-muted-foreground">{{ t('privacy.access.body') }}</p>
    </MarketingProseSection>

    <MarketingProseSection :title="t('privacy.unverified.title')" data-testid="privacy-unverified">
      <p class="text-muted-foreground">{{ t('privacy.unverified.body') }}</p>
      <p class="text-muted-foreground">{{ t('privacy.unverified.public') }}</p>
    </MarketingProseSection>

    <MarketingProseSection :title="t('privacy.unbinding.title')" data-testid="privacy-unbinding">
      <p class="text-muted-foreground">{{ t('privacy.unbinding.body') }}</p>
    </MarketingProseSection>

    <MarketingProseSection :title="t('privacy.deletion.title')" data-testid="privacy-deletion">
      <p class="text-muted-foreground">{{ t('privacy.deletion.body') }}</p>

      <!-- Written out rather than bound: where a deletion is asked for until
           there is a button that does it, and a constant address is not a
           value the page computes. -->
      <a
        href="https://github.com/Klay376014/blueberry-academy/issues"
        class="text-primary underline"
        target="_blank"
        rel="noopener noreferrer"
        data-testid="privacy-repository"
      >
        {{ t('privacy.deletion.repository') }}
      </a>
    </MarketingProseSection>

    <MarketingProseSection :title="t('privacy.others.title')" data-testid="privacy-others">
      <p class="text-muted-foreground">{{ t('privacy.others.body') }}</p>
      <p class="text-muted-foreground">{{ t('privacy.others.browser') }}</p>
    </MarketingProseSection>

    <MarketingProseSection :title="t('privacy.terms.title')" data-testid="privacy-terms">
      <p class="text-muted-foreground">{{ t('privacy.terms.body') }}</p>
      <p class="text-sm text-muted-foreground">{{ t('privacy.terms.trademarks') }}</p>
    </MarketingProseSection>
  </main>
</template>
