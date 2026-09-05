<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { ChevronDown, LogOut, Settings, UserRound } from '@lucide/vue'

/**
 * Everything to do with the reader's own account, in one place: the settings
 * that are theirs, and the way out (issue #128).
 *
 * It exists because signing out used to sit in the header next to the theme
 * toggle — one press, no confirmation, the same size and weight as switching
 * to dark mode. Behind a menu it costs two deliberate presses, and the nav
 * beside it goes back to being navigation.
 *
 * On reka-ui's menu rather than a button and a `v-if`: the keyboard (Enter to
 * open, arrows to move, Escape to close), the focus trap and the
 * `aria-expanded` on the trigger are the whole reason a menu is more than a
 * hidden `<div>`, and none of them is worth reimplementing.
 */
const { t } = useI18n()
const localePath = useLocalePath()
const { user, signOut } = useAuth()

const ITEM =
  'flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-sm px-2 text-sm outline-none [&_svg]:size-4'
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <UiButton
        variant="ghost"
        size="sm"
        class="min-h-11 min-w-11 max-w-52"
        data-testid="user-menu"
      >
        <UserRound />
        <!-- The address only where there is room for it: at 375px the button
             is the icon and the chevron. What stands in for it there is a name
             only a screen reader hears, rather than an `aria-label` over the
             whole button: an accessible name that does not contain the visible
             one is what WCAG 2.5.3 is about, and it breaks "press the button
             that says …" for anyone driving this by voice. -->
        <span class="hidden truncate sm:inline">{{ user?.email ?? t('nav.account') }}</span>
        <span class="sr-only sm:hidden">{{ t('a11y.accountMenu') }}</span>
        <ChevronDown class="opacity-60" />
      </UiButton>
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <DropdownMenuContent
        align="end"
        :side-offset="6"
        class="z-50 min-w-56 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        data-testid="user-menu-content"
      >
        <DropdownMenuItem as-child>
          <NuxtLink
            :to="localePath('/settings')"
            :class="`${ITEM} data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground`"
            data-testid="menu-settings"
          >
            <Settings />
            {{ t('nav.settings') }}
          </NuxtLink>
        </DropdownMenuItem>

        <!-- A rule, and the only destructive colour in the menu: leaving is
             not another way of navigating. -->
        <DropdownMenuSeparator class="my-1 h-px bg-border" />

        <DropdownMenuItem
          :class="`${ITEM} text-destructive data-[highlighted]:bg-destructive/10`"
          data-testid="sign-out"
          @select="() => signOut()"
        >
          <LogOut />
          {{ t('nav.signOut') }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
