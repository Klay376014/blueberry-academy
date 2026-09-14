<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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

/**
 * The trigger's accessible name. Icon-only, it is the only thing a screen
 * reader gets from the header — so it carries the address when there is one,
 * which is the same question the menu's first line answers for everybody else
 * (issue #192). WCAG 2.5.3 has nothing to object to: the button has no visible
 * text for this name to contain.
 */
const triggerLabel = computed(() =>
  user.value?.email ? `${t('a11y.accountMenu')} — ${user.value.email}` : t('a11y.accountMenu'),
)

const ITEM =
  'flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-sm px-2 text-sm outline-none [&_svg]:size-4'
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <!-- The icon and the chevron at every width, which is what 375px always
           got. Printing the address here cost the header its fixed width and
           still could not show it: `max-w-52` cut a Google address to
           `ads1029384756@g…`. It is not navigation — it answers "which account
           is this?", and that question is asked on the way into the menu,
           where the address now sits in full (issue #192).

           With no visible text left on the button, WCAG 2.5.3 no longer has a
           visible name to contain, so the accessible one is an `aria-label`
           rather than the `sr-only` span it used to need. -->
      <UiButton
        variant="ghost"
        size="sm"
        class="min-h-11 min-w-11"
        :aria-label="triggerLabel"
        data-testid="user-menu"
      >
        <UserRound />
        <ChevronDown class="opacity-60" />
      </UiButton>
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <DropdownMenuContent
        align="end"
        :side-offset="6"
        class="z-50 min-w-56 max-w-72 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        data-testid="user-menu-content"
      >
        <!-- A label, not an item: the address is what the menu says, not
             something to press, and the arrow keys should walk past it rather
             than stop on it. `break-all` rather than another truncation —
             cutting it here would only move the header's problem indoors — and
             the whole block goes when there is no address, since a Supabase
             user can carry none and "Signed in as" over a blank says less than
             nothing. -->
        <template v-if="user?.email">
          <DropdownMenuLabel class="px-2 py-1.5" data-testid="menu-identity">
            <span class="block text-xs font-normal text-muted-foreground">
              {{ t('nav.signedIn') }}
            </span>
            <span class="block break-all text-sm font-medium">{{ user.email }}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator class="my-1 h-px bg-border" />
        </template>

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
