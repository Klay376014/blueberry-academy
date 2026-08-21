<script setup lang="ts">
// PROTOTYPE — shared by all three variants. Dogfoods speciesIcon/speciesName
// from #22: the sheet is fetched from Showdown, so this needs a network.
const props = defineProps<{ id: string; size?: 'sm' | 'md' }>()

const slot = computed(() => speciesIcon(props.id))
const scale = computed(() => (props.size === 'sm' ? 0.7 : 1))
</script>

<template>
  <span
    :title="speciesName(id)"
    :aria-label="speciesName(id)"
    class="inline-block shrink-0 bg-no-repeat align-middle [image-rendering:pixelated]"
    :style="{
      width: `${40 * scale}px`,
      height: `${30 * scale}px`,
      backgroundImage: `url(${ICON_SHEET_URL})`,
      backgroundPosition: `${slot.left}px ${slot.top}px`,
      transform: scale === 1 ? undefined : `scale(${scale})`,
      transformOrigin: 'left center',
    }"
  />
</template>
