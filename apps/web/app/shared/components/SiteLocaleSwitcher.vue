<script setup lang="ts">
/**
 * The other language, as a button. In the footer rather than the header
 * (issue #128): which language you read in is chosen once and then never
 * again, and it was taking a place in the header next to things that are
 * pressed all the time.
 */
const { t, locale, locales, setLocale } = useI18n()

const otherLocale = computed(() =>
  locales.value.find((candidate) => candidate.code !== locale.value),
)

// A method rather than an inline handler: inside an arrow function in the
// template, `v-if="otherLocale"` no longer narrows it, and vue-tsc rightly
// says it may be undefined.
function switchLocale() {
  if (otherLocale.value) setLocale(otherLocale.value.code)
}
</script>

<template>
  <!-- A wrapper rather than the button as the root: the button is behind a
       `v-if`, and a component whose only root is conditional renders nothing
       at all when the condition is false, which lint rightly objects to. -->
  <div class="flex items-center">
    <UiButton
      v-if="otherLocale"
      variant="outline"
      size="sm"
      class="min-h-11 min-w-11"
      :aria-label="t('a11y.switchLanguage')"
      data-testid="locale-switcher"
      @click="switchLocale"
    >
      {{ otherLocale.name }}
    </UiButton>
  </div>
</template>
