<script setup lang="ts">
import { ICON_HEIGHT, ICON_SHEET_URL, ICON_WIDTH, speciesIcon } from '../utils/speciesIcon'

/**
 * One Pokémon, drawn from Showdown's icon sheet.
 *
 * Decorative by default: a party of six would otherwise announce six labels in
 * a row. `SpeciesParty` puts one label on the group instead. Pass `label` where
 * the icon stands alone and is the only thing naming the Pokémon — in the
 * timeline it replaces the name outright, so it has to say it.
 *
 * The cell is a fixed 40×30 on the sheet, so `size` scales the drawn sprite
 * rather than resizing the window onto it — shrinking the window would crop
 * the sprite instead of shrinking it.
 */
const props = withDefaults(defineProps<{ id: string; size?: number; label?: string }>(), {
  size: 24,
  label: undefined,
})

const scale = computed(() => props.size / ICON_WIDTH)
const slot = computed(() => speciesIcon(props.id))
</script>

<template>
  <span
    class="inline-block shrink-0 overflow-hidden align-middle"
    :style="{ width: `${size}px`, height: `${ICON_HEIGHT * scale}px` }"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    :title="label"
  >
    <span
      class="block [image-rendering:pixelated]"
      :style="{
        width: `${ICON_WIDTH}px`,
        height: `${ICON_HEIGHT}px`,
        backgroundImage: `url(${ICON_SHEET_URL})`,
        backgroundPosition: `${slot.left}px ${slot.top}px`,
        transform: `scale(${scale})`,
        transformOrigin: '0 0',
      }"
    />
  </span>
</template>
