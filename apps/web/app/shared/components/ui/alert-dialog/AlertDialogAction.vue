<script setup lang="ts">
import type { AlertDialogActionProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import type { ButtonVariants } from '../button'
import { reactiveOmit } from '@vueuse/core'
import { AlertDialogAction } from 'reka-ui'
import { buttonVariants } from '../button'
import { cn } from '@/shared/lib/utils'

const props = defineProps<
  AlertDialogActionProps & { class?: HTMLAttributes['class']; variant?: ButtonVariants['variant'] }
>()

const delegatedProps = reactiveOmit(props, 'class', 'variant')
</script>

<template>
  <AlertDialogAction
    data-slot="alert-dialog-action"
    :class="cn(buttonVariants({ variant: props.variant }), props.class)"
    v-bind="delegatedProps"
  >
    <slot />
  </AlertDialogAction>
</template>
