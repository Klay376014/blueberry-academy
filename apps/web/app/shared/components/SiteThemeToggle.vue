<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue'

/** Light or dark, one press. Drawn in the header of both shells. */
const { t } = useI18n()
const colorMode = useColorMode()

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <UiButton
    variant="ghost"
    size="icon"
    class="min-h-11 min-w-11"
    :aria-label="t('a11y.toggleTheme')"
    data-testid="theme-toggle"
    @click="toggleTheme"
  >
    <Moon v-if="colorMode.value === 'dark'" />
    <Sun v-else />
  </UiButton>
</template>
