<script setup lang="ts">
// PROTOTYPE — the floating variant switcher. Not part of any design being
// judged, so it is deliberately loud. Never rendered in a production build.
const props = defineProps<{ variants: { key: string; name: string }[]; current: string }>()

const router = useRouter()
const route = useRoute()

const index = computed(() =>
  Math.max(
    0,
    props.variants.findIndex((v) => v.key === props.current),
  ),
)
const currentName = computed(() => props.variants[index.value]?.name ?? '')

function go(step: number) {
  const next = props.variants[(index.value + step + props.variants.length) % props.variants.length]
  if (next) router.replace({ query: { ...route.query, variant: next.key } })
}

function onKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  const typing =
    target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
  if (typing) return
  if (event.key === 'ArrowLeft') go(-1)
  if (event.key === 'ArrowRight') go(1)
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div
    class="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border-2 border-amber-500 bg-black/90 px-2 py-1 text-sm text-white shadow-lg"
  >
    <button
      type="button"
      class="rounded-full px-2 py-1 hover:bg-white/20"
      aria-label="Previous variant"
      @click="() => go(-1)"
    >
      ←
    </button>
    <span class="px-2 font-mono tabular-nums"> PROTOTYPE {{ current }} — {{ currentName }} </span>
    <button
      type="button"
      class="rounded-full px-2 py-1 hover:bg-white/20"
      aria-label="Next variant"
      @click="() => go(1)"
    >
      →
    </button>
  </div>
</template>
