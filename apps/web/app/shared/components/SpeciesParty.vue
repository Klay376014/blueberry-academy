<script setup lang="ts">
import { speciesName } from '../utils/speciesName'

/**
 * A team or a bring, as the row of Pokémon it is.
 *
 * `signature` is the stored form — base species ids joined by `|`. The names
 * are read out as one label on the group rather than one per icon, and they
 * stay English: a species name is an identifier, not copy (design document §3).
 */
const props = withDefaults(defineProps<{ signature: string | null; size?: number }>(), {
  size: 24,
})

const ids = computed(() => (props.signature ?? '').split('|').filter(Boolean))
const label = computed(() => ids.value.map(speciesName).join(', '))
</script>

<template>
  <span class="flex items-center gap-px" role="img" :aria-label="label">
    <SpeciesIcon v-for="id of ids" :key="id" :id :size :title="speciesName(id)" />
  </span>
</template>
