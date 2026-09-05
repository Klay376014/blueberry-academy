<script setup lang="ts">
/**
 * The product's name, and the way back to `/` from anywhere.
 *
 * Not translated: it is the name of the thing, the same in both languages, and
 * a locale file is where a name goes to be quietly rewritten by whoever is
 * translating the sentence next to it.
 */
const localePath = useLocalePath()
</script>

<template>
  <NuxtLink
    :to="localePath('/')"
    class="inline-flex min-h-11 items-center rounded-md px-1 text-base font-semibold tracking-tight transition-colors hover:text-primary"
    data-testid="site-brand"
  >
    Blueberry Academy
  </NuxtLink>
</template>
