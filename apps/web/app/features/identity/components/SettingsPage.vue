<script setup lang="ts">
import type { BindResult } from '../composables/useProfile'
import type { ReattributionReport } from '../composables/useReattribution'

const { t } = useI18n()
const { aliases, loaded, load, bindAlias, unbindAlias } = useProfile()
const { running, progress, reattribute } = useReattribution()
const { count, gamesOf } = useAliasCounts()

const emit = defineEmits<{ reattributed: [] }>()

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
/** The run that finished, so its two numbers can be shown. */
const summary = ref<ReattributionReport | null>(null)
/** The run that did not, and how far it got. */
const stopped = ref<ReattributionReport | null>(null)

/**
 * Shut while a re-attribution runs: the alias list is half-applied until it
 * finishes, and binding a second name on top would interleave two runs over a
 * write that replaces the whole array.
 */
const busy = computed(() => !loaded.value || running.value)

// Awaited in setup, so the list is on screen the first time it is painted
// rather than appearing a tick later.
// Not awaited, and its failure is not the page's: the alias list is what the
// page is for, and the counts beside it are an answer to a second question.
void count()

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
  summary.value = null
  stopped.value = null
}

/**
 * The battles already imported, re-attributed against the list as it now
 * stands. Reports rather than throws: the alias list is written either way,
 * and what is left is a run to finish rather than a change to undo.
 */
async function reattributeBattles() {
  const outcome = await reattribute()

  if (outcome.status === 'done') summary.value = outcome.report
  else stopped.value = outcome.report

  // Rows moved, so the numbers beside the names are the ones from before.
  await count()

  // Whichever it was, rows moved and the dashboard is holding the ones from
  // before them.
  emit('reattributed')
}

async function bind() {
  const name = typed.value
  clearMessages()

  try {
    const result = await bindAlias(name)
    if (result === 'bound') {
      typed.value = ''
      await reattributeBattles()
    } else {
      notice.value = result
      rejected.value = name
    }
  } catch {
    writeFailed.value = true
  }
}

/** The same run, with nothing bound or unbound first. */
async function rerun() {
  clearMessages()
  await reattributeBattles()
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
            :disabled="busy"
            autocapitalize="off"
            autocomplete="off"
            spellcheck="false"
            data-testid="alias-input"
            @input="clearMessages"
          />
        </div>
        <UiButton type="submit" :disabled="busy" data-testid="alias-bind">
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

      <p
        v-if="running && progress"
        class="mt-3 text-sm text-muted-foreground"
        data-testid="reattribution-progress"
      >
        {{ t('settings.aliases.reattributing', progress) }}
      </p>
      <p
        v-else-if="summary"
        class="mt-3 text-sm text-muted-foreground"
        data-testid="reattribution-summary"
      >
        {{ t('settings.aliases.reattributed', summary) }}
      </p>
      <p
        v-else-if="stopped"
        class="mt-3 text-sm text-destructive"
        data-testid="reattribution-error"
      >
        {{ t('settings.aliases.reattributionFailed', stopped) }}
      </p>

      <ul v-if="aliases.length" class="mt-6 divide-y divide-border border-y border-border">
        <li
          v-for="alias of aliases"
          :key="alias"
          class="flex items-center justify-between gap-4 py-2"
        >
          <span class="font-medium" data-testid="alias-name">{{ alias }}</span>
          <span
            v-if="gamesOf(alias) !== null"
            class="ml-auto text-sm text-muted-foreground tabular-nums"
            data-testid="alias-games"
          >
            {{ t('settings.aliases.games', { games: gamesOf(alias) }) }}
          </span>
          <UiButton
            variant="ghost"
            size="sm"
            :aria-label="t('settings.aliases.remove', { name: alias })"
            :disabled="busy"
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

      <!-- Always here to press: attribution is derived from the list as it
           now stands, so re-running it is idempotent — and it is the only way
           back from a run that stopped, or from a list changed on another
           device. -->
      <div class="mt-6 flex items-center gap-3">
        <UiButton
          variant="outline"
          size="sm"
          :disabled="busy"
          data-testid="reattribute"
          @click="rerun"
        >
          {{ t('settings.aliases.reattribute') }}
        </UiButton>
        <span class="text-sm text-muted-foreground">{{
          t('settings.aliases.reattributeHint')
        }}</span>
      </div>
    </section>
  </main>
</template>
