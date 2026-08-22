<script setup lang="ts">
import type { IngestOutcome } from '~/composables/useIngest'

const { t, locale } = useI18n()
const { loaded, load } = useProfile()
const { importReplay } = useIngest()

const typed = ref('')
/** Unique per component instance, so the label keeps pointing at its own input. */
const linkInputId = useId()
/** One import at a time, and the button says so. */
const busy = ref(false)
const outcome = ref<IngestOutcome | null>(null)
/** The link was not a replay link, so Showdown was never asked. */
const linkInvalid = ref(false)
const profileFailed = ref(false)

// Awaited in setup: the alias list decides which side of a battle is "me", so
// the form must not be usable before it has arrived.
try {
  await load()
} catch {
  profileFailed.value = true
}

/** The row, whether or not the parse behind it worked. */
const battle = computed(() => (outcome.value?.status === 'failed' ? null : outcome.value?.battle))
const failure = computed(() => (outcome.value?.status === 'failed' ? outcome.value : null))
const spectated = computed(() => battle.value?.my_side === null)

/** The four (or fewer) that actually showed up, by name rather than by id. */
const bring = computed(() =>
  (battle.value?.bring_signature?.split('|') ?? []).filter(Boolean).map(speciesName),
)

const playedOn = computed(() =>
  battle.value ? new Date(battle.value.played_at).toLocaleDateString(locale.value) : '',
)

/** One sentence per reason, because "it failed" is not worth reading. */
const failureMessage = computed(() => {
  const reason = failure.value?.reason
  if (!reason) return ''

  return {
    'not-found': t('import.failed.notFound'),
    unavailable: t('import.failed.unavailable'),
    malformed: t('import.failed.malformed'),
    'store-failed': t('import.failed.storeFailed'),
    'write-failed': t('import.failed.writeFailed'),
  }[reason]
})

async function submit() {
  // A second press while the first import is in the air would ask Showdown
  // for the same replay twice.
  if (busy.value || !loaded.value) return

  outcome.value = null
  linkInvalid.value = false

  // Parsed here rather than by Showdown: a user who pasted their profile page
  // deserves a sentence about the link, not a 404 about a replay.
  const target = parseReplayLink(typed.value)
  if (!target) {
    linkInvalid.value = true
    return
  }

  busy.value = true
  try {
    outcome.value = await importReplay(target)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="py-8">
    <h1 class="text-3xl font-semibold tracking-tight">{{ t('import.title') }}</h1>
    <p class="mt-2 text-muted-foreground">{{ t('import.tagline') }}</p>

    <section class="mt-8 max-w-prose">
      <p v-if="profileFailed" class="text-sm text-destructive" data-testid="import-profile-error">
        {{ t('import.profileFailed') }}
      </p>

      <form class="mt-4 flex items-end gap-2" data-testid="import-form" @submit.prevent="submit">
        <div class="flex-1">
          <label class="text-sm font-medium" :for="linkInputId">{{ t('import.label') }}</label>
          <input
            :id="linkInputId"
            v-model="typed"
            class="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
            :placeholder="t('import.placeholder')"
            :disabled="!loaded"
            autocapitalize="off"
            autocomplete="off"
            spellcheck="false"
            data-testid="import-input"
          />
        </div>
        <UiButton type="submit" :disabled="!loaded || busy" data-testid="import-submit">
          {{ busy ? t('import.working') : t('import.submit') }}
        </UiButton>
      </form>

      <p v-if="linkInvalid" class="mt-3 text-sm text-destructive" data-testid="import-error">
        {{ t('import.badLink') }}
      </p>
      <p v-else-if="failure" class="mt-3 text-sm text-destructive" data-testid="import-error">
        {{ failureMessage }}
      </p>

      <article
        v-if="battle"
        class="mt-6 rounded-md border border-border p-4"
        data-testid="import-result"
      >
        <div class="flex items-baseline justify-between gap-4">
          <p
            v-if="battle.result"
            class="text-lg font-semibold"
            :class="battle.result === 'win' ? 'text-emerald-600' : 'text-muted-foreground'"
            data-testid="battle-result"
          >
            {{ t(`import.battle.${battle.result}`) }}
          </p>
          <p class="text-sm text-muted-foreground">{{ playedOn }}</p>
        </div>

        <p v-if="battle.opponent_username" class="mt-1" data-testid="battle-opponent">
          {{ t('import.battle.opponent', { name: battle.opponent_username }) }}
        </p>

        <!-- The alias list decided this, and the user is the only one who can
             fix it — so say what happened rather than showing an empty row. -->
        <p
          v-if="spectated"
          class="mt-1 text-sm text-muted-foreground"
          data-testid="battle-spectated"
        >
          {{ t('import.battle.spectated') }}
        </p>

        <dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <dt>{{ t('import.battle.format') }}</dt>
          <dd class="text-foreground">{{ battle.format_id }}</dd>
          <template v-if="battle.turn_count !== null">
            <dt>{{ t('import.battle.turns') }}</dt>
            <dd class="text-foreground">{{ battle.turn_count }}</dd>
          </template>
          <template v-if="battle.rating !== null">
            <dt>{{ t('import.battle.rating') }}</dt>
            <dd class="text-foreground">{{ battle.rating }}</dd>
          </template>
        </dl>

        <ul v-if="bring.length" class="mt-3 flex flex-wrap gap-2" data-testid="battle-bring">
          <li v-for="species of bring" :key="species" class="rounded-md bg-muted px-2 py-1 text-sm">
            {{ species }}
          </li>
        </ul>

        <p
          v-if="outcome?.status === 'unparsed'"
          class="mt-3 text-sm text-destructive"
          data-testid="import-unparsed"
        >
          {{ t('import.unparsed', { message: outcome.message }) }}
        </p>
      </article>
    </section>
  </main>
</template>
