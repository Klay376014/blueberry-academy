<script setup lang="ts">
import type { AlertDialogCancelProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { AlertDialogCancel } from 'reka-ui'
import { buttonVariants } from '../button'
import { cn } from '@/shared/lib/utils'

/**
 * The way out — and where reka-ui puts the focus as the dialog opens, which is
 * the point of an alert dialog over a plain one: the destructive button is not
 * what a stray Enter lands on.
 */
const props = defineProps<AlertDialogCancelProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <AlertDialogCancel
    data-slot="alert-dialog-cancel"
    :class="cn(buttonVariants({ variant: 'outline' }), props.class)"
    v-bind="delegatedProps"
  >
    <slot />
  </AlertDialogCancel>
</template>
