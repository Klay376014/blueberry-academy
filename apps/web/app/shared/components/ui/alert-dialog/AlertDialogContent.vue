<script setup lang="ts">
import type { AlertDialogContentEmits, AlertDialogContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { AlertDialogContent, AlertDialogPortal, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/shared/lib/utils'
import AlertDialogOverlay from './AlertDialogOverlay.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps<AlertDialogContentProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<AlertDialogContentEmits>()

const forwarded = useForwardPropsEmits(reactiveOmit(props, 'class'), emits)
</script>

<!--
  The inset width and `p-4 sm:p-6` are a local edit over the `w-full p-6` that
  `shadcn-vue add alert-dialog` writes, so re-running the CLI writes it back.
  What the numbers are for: the narrow-screen case in
  test/nuxt/touch-targets.spec.ts.
-->
<template>
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogContent
      data-slot="alert-dialog-content"
      :class="
        cn(
          'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200 fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border p-4 shadow-lg sm:w-full sm:p-6',
          props.class,
        )
      "
      v-bind="{ ...$attrs, ...forwarded }"
    >
      <slot />
    </AlertDialogContent>
  </AlertDialogPortal>
</template>
