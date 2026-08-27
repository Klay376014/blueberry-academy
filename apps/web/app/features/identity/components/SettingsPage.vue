<script setup lang="ts">
import type { BindResult } from '../composables/useProfile'
import type { ReattributionReport } from '../composables/useReattribution'
import { summaryKeyOf } from '../composables/useReattribution'

const { t } = useI18n()
const { aliases, loaded, load, bindAlias, unbindAlias } = useProfile()
const { running, progress, reattribute } = useReattribution()
const { count, battleCountOf } = useAliasCounts()

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
/** The run that finished, so what it did can be reported. */
const summary = ref<ReattributionReport | null>(null)
/** The run that did not, and how far it got. */
const stopped = ref<ReattributionReport | null>(null)

/**
 * The name the user has asked to remove, until they say so again.
 *
 * Removing one is the single action in the app that takes a large part of
 * somebody's statistics away, and "remove a name" is not what that feels like
 * — so the count comes with the question (#70), and it is the number already
 * beside the name rather than a second trip to ask what is about to be lost.
 */
const removing = ref<string | null>(null)

/**
 * Shut while a re-attribution runs: the alias list is half-applied until it
 * finishes, and binding a second name on top would interleave two runs over a
 * write that replaces the whole array.
 */
const busy = computed(() => !loaded.value || running.value)

/** What a finished run has to say, in this locale. */
const summaryText = computed(() => {
  const report = summary.value
  if (report === null) return null

  const key = summaryKeyOf(report)

  // The one with a plural form needs the number as the count, not as a name.
  return key === 'unbound'
    ? t(`settings.aliases.${key}`, report.unattributed)
    : t(`settings.aliases.${key}`, report)
})

/** What removing the name in question would cost, if it is known. */
const removingCount = computed(() =>
  removing.value === null ? null : battleCountOf(removing.value),
)

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

// Not awaited, unlike the list itself: the names are what the page is for and
// the counts beside them answer a second question.
void count()

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
  try {
    const outcome = await reattribute()

    if (outcome.status === 'done') summary.value = outcome.report
    else stopped.value = outcome.report
  } catch {
    writeFailed.value = true
    return
  }

  // Whichever it was, rows moved: the counts beside the names and the rows the
  // dashboard is holding are both the ones from before them.
  await count()
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

async function rerun() {
  clearMessages()
  await reattributeBattles()
}

/**
 * The confirm button's handler, holding the name the dialog was opened for.
 *
 * The primitive closes the dialog as the button is pressed, so a handler that
 * read `removing` when it ran would find it already cleared.
 */
const confirmRemoval = computed(() => {
  const name = removing.value

  return name === null ? () => {} : () => unbind(name)
})

/** reka-ui dismisses the dialog itself, on Esc and on a click outside it. */
function onDialogToggle(isOpen: boolean) {
  if (!isOpen) removing.value = null
}

async function askToRemove(name: string) {
  // The question has to carry the number, and the first read of it is not
  // awaited anywhere — so if it has not landed, ask for it now rather than
  // opening a confirmation that cannot say what it will cost.
  if (battleCountOf(name) === null) await count()

  removing.value = name
}

async function unbind(name: string) {
  removing.value = null
  // Cleared here rather than when the question was asked: calling the question
  // off must leave the page exactly as it was, the last run's report included.
  clearMessages()

  try {
    await unbindAlias(name)
  } catch {
    writeFailed.value = true
    return
  }

  // The battles that name claimed are handed back by the same run that claims
  // them the other way round: attribution is the alias list, re-derived.
  await reattributeBattles()
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
        v-else-if="summaryText"
        class="mt-3 text-sm text-muted-foreground"
        data-testid="reattribution-summary"
      >
        {{ summaryText }}
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
            v-if="battleCountOf(alias) !== null"
            class="ml-auto text-sm text-muted-foreground tabular-nums"
            data-testid="alias-battles"
          >
            {{ t('settings.aliases.battles', battleCountOf(alias) ?? 0) }}
          </span>
          <UiButton
            variant="ghost"
            size="sm"
            :aria-label="t('settings.aliases.remove', { name: alias })"
            :disabled="busy"
            data-testid="alias-remove"
            @click="() => askToRemove(alias)"
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

    <UiAlertDialog :open="removing !== null" @update:open="onDialogToggle">
      <UiAlertDialogContent data-testid="unbind-confirm">
        <UiAlertDialogTitle>
          {{ t('settings.aliases.removeTitle', { name: removing }) }}
        </UiAlertDialogTitle>
        <UiAlertDialogDescription>
          {{
            removingCount === null
              ? t('settings.aliases.removeBodyUnknown')
              : t('settings.aliases.removeBody', removingCount)
          }}
        </UiAlertDialogDescription>
        <UiAlertDialogFooter>
          <UiAlertDialogCancel data-testid="unbind-cancel">
            {{ t('settings.aliases.removeCancel') }}
          </UiAlertDialogCancel>
          <UiAlertDialogAction
            variant="destructive"
            data-testid="unbind-remove"
            @click="confirmRemoval"
          >
            {{ t('settings.aliases.removeShort') }}
          </UiAlertDialogAction>
        </UiAlertDialogFooter>
      </UiAlertDialogContent>
    </UiAlertDialog>
  </main>
</template>
