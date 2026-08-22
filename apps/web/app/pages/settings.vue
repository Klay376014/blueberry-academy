<script setup lang="ts">
import type { BindResult } from '~/composables/useProfile'

const { t } = useI18n()
const { aliases, loaded, load, bindAlias, unbindAlias } = useProfile()

const typed = ref('')
/** Unique per instance, so the label keeps pointing at its own input. */
const aliasInputId = useId()
/** Which of the "that name was not added" messages to show, if any. */
const notice = ref<Exclude<BindResult, 'bound'> | null>(null)
/** The name that notice is about, held apart from the field the user is still
 * typing in -- otherwise the message rewrites itself as they type. */
const rejected = ref('')
const loadFailed = ref(false)
const writeFailed = ref(false)

// Awaited in setup, so the list is on screen the first time it is painted
// rather than appearing a tick later.
try {
  await load()
} catch {
  // Reported as a read failure, and the form stays shut: binding replaces the
  // whole list, so adding a name on top of a list that never arrived would
  // wipe the names that are really there.
  loadFailed.value = true
}

function clearMessages() {
  notice.value = null
  writeFailed.value = false
}

async function bind() {
  const name = typed.value
  clearMessages()

  try {
    const result = await bindAlias(name)
    if (result === 'bound') {
      typed.value = ''
    } else {
      notice.value = result
      rejected.value = name
    }
  } catch {
    writeFailed.value = true
  }
}

async function unbind(name: string) {
  clearMessages()

  try {
    await unbindAlias(name)
  } catch {
    writeFailed.value = true
  }
}
</script>

<template>
  <main class="py-8">
    <h1 class="text-3xl font-semibold tracking-tight">{{ t('settings.title') }}</h1>

    <section class="mt-8 max-w-prose">
      <h2 class="text-xl font-semibold tracking-tight">{{ t('settings.aliases.title') }}</h2>
      <p class="mt-2 text-muted-foreground">{{ t('settings.aliases.tagline') }}</p>

      <!-- Ownership of a Showdown account cannot be verified (design document
           §10), and the user must not walk away thinking it was. -->
      <p
        class="mt-4 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
        data-testid="alias-unverified"
      >
        {{ t('settings.aliases.unverified') }}
      </p>

      <p v-if="loadFailed" class="mt-4 text-sm text-destructive" data-testid="alias-load-error">
        {{ t('settings.aliases.loadFailed') }}
      </p>

      <form class="mt-6 flex items-end gap-2" data-testid="alias-form" @submit.prevent="bind">
        <div class="flex-1">
          <label class="text-sm font-medium" :for="aliasInputId">
            {{ t('settings.aliases.label') }}
          </label>
          <input
            :id="aliasInputId"
            v-model="typed"
            class="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
            :placeholder="t('settings.aliases.placeholder')"
            :disabled="!loaded"
            autocapitalize="off"
            autocomplete="off"
            spellcheck="false"
            data-testid="alias-input"
            @input="clearMessages"
          />
        </div>
        <UiButton type="submit" :disabled="!loaded" data-testid="alias-bind">
          {{ t('settings.aliases.bind') }}
        </UiButton>
      </form>

      <p v-if="notice" class="mt-3 text-sm text-muted-foreground" data-testid="alias-message">
        {{
          notice === 'already-bound'
            ? t('settings.aliases.alreadyBound', { name: rejected })
            : t('settings.aliases.unusable')
        }}
      </p>
      <p v-if="writeFailed" class="mt-3 text-sm text-destructive" data-testid="alias-error">
        {{ t('settings.aliases.failed') }}
      </p>

      <ul v-if="aliases.length" class="mt-6 divide-y divide-border border-y border-border">
        <li
          v-for="alias of aliases"
          :key="alias"
          class="flex items-center justify-between gap-4 py-2"
        >
          <span class="font-medium" data-testid="alias-name">{{ alias }}</span>
          <UiButton
            variant="ghost"
            size="sm"
            :aria-label="t('settings.aliases.remove', { name: alias })"
            :disabled="!loaded"
            data-testid="alias-remove"
            @click="() => unbind(alias)"
          >
            {{ t('settings.aliases.removeShort') }}
          </UiButton>
        </li>
      </ul>
      <p v-else-if="loaded" class="mt-6 text-sm text-muted-foreground" data-testid="alias-empty">
        {{ t('settings.aliases.empty') }}
      </p>
    </section>
  </main>
</template>
