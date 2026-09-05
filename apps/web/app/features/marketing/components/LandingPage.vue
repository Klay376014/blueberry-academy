<script setup lang="ts">
/**
 * What `/` says to a stranger (issue #126): what this is, the question it
 * answers, and how to start.
 *
 * Every claim here is about something that exists — importing, the two
 * signatures, the timeline. There is no social proof: it would have to be
 * invented, and `test/nuxt/landing.spec.ts` keeps it out.
 */
const { t } = useI18n()
const localePath = useLocalePath()

/**
 * The two headings this page labels itself, for the two sections that are not
 * a column of prose: the hero is an `<h1>` and the answers are a grid, so
 * neither fits `<MarketingProseSection>` — which is what the other two use,
 * and where the same labelling lives.
 */
const instance = useId()
const headingId = (section: string) => `${instance}-${section}`

/** The three answers, in the order they are worth reading. */
const offers = ['import', 'teams', 'timeline'] as const
const steps = ['one', 'two', 'three'] as const
</script>

<template>
  <main class="flex flex-col gap-16 py-16" data-testid="landing">
    <section class="flex flex-col items-start gap-4" :aria-labelledby="headingId('hero')">
      <h1
        :id="headingId('hero')"
        class="max-w-3xl text-4xl font-semibold tracking-tight text-balance"
      >
        {{ t('landing.hero.title') }}
      </h1>
      <p class="max-w-2xl text-lg text-muted-foreground">{{ t('landing.hero.tagline') }}</p>

      <div class="mt-2 flex flex-wrap items-center gap-3">
        <UiButton as-child size="lg">
          <NuxtLink :to="localePath('/login')" data-testid="landing-cta">
            {{ t('landing.hero.cta') }}
          </NuxtLink>
        </UiButton>
        <UiButton as-child variant="ghost" size="lg">
          <NuxtLink :to="localePath('/about')">{{ t('landing.hero.secondary') }}</NuxtLink>
        </UiButton>
      </div>
    </section>

    <MarketingProseSection :title="t('landing.problem.title')">
      <p class="text-muted-foreground">{{ t('landing.problem.body') }}</p>
    </MarketingProseSection>

    <section class="flex flex-col gap-4" :aria-labelledby="headingId('solution')">
      <h2 :id="headingId('solution')" class="text-2xl font-semibold tracking-tight">
        {{ t('landing.solution.title') }}
      </h2>

      <div class="grid gap-4 md:grid-cols-3">
        <article
          v-for="offer in offers"
          :key="offer"
          class="flex flex-col gap-2 rounded-lg border border-border bg-card p-5"
        >
          <h3 class="font-semibold">{{ t(`landing.solution.${offer}.title`) }}</h3>
          <p class="text-sm text-muted-foreground">{{ t(`landing.solution.${offer}.body`) }}</p>
        </article>
      </div>
    </section>

    <MarketingProseSection :title="t('landing.start.title')">
      <!-- Real markers rather than a drawn stand-in: Tailwind's preflight
           takes them off, and a list styled to `list-style: none` stops being
           a list to VoiceOver. -->
      <ol
        class="flex list-decimal flex-col gap-3 pl-6 marker:font-mono marker:text-sm marker:text-muted-foreground"
      >
        <li v-for="step in steps" :key="step" class="text-muted-foreground">
          {{ t(`landing.start.${step}`) }}
        </li>
      </ol>

      <p class="text-sm text-muted-foreground">{{ t('landing.start.note') }}</p>

      <UiButton as-child class="self-start">
        <NuxtLink :to="localePath('/login')">{{ t('landing.start.cta') }}</NuxtLink>
      </UiButton>

      <!--
        The page that says what signing in hands over, one link from the button
        that starts it (issue #127).
      -->
      <NuxtLink :to="localePath('/privacy')" class="text-sm text-primary underline">
        {{ t('privacy.title') }}
      </NuxtLink>
    </MarketingProseSection>
  </main>
</template>
