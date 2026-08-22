<script setup lang="ts">
import { toID } from 'replay-parser'
import type { BatchOutcome, ImportReport } from '~/composables/useIngest'
import type { ReplayRef } from '~/composables/useShowdown'

const { t, locale } = useI18n()
const { aliases, loaded, load } = useProfile()
const { importMany, syncAccount } = useIngest()

/** One line per replay, the way a pasted list arrives. */
const links = ref('')
const busy = ref(false)
const profileFailed = ref(false)

const report = ref<ImportReport | null>(null)
/** Lines that were never a replay link — refused here, still worth listing. */
const badLines = ref<string[]>([])
/** A failure of the whole attempt: nothing was listed, so nothing was tried. */
const failure = ref<{ reason: string; message: string } | null>(null)
const truncated = ref(false)

// Awaited in setup: the alias list decides which side of a battle is "me", so
// neither form may be usable before it has arrived.
try {
  await load()
} catch {
  profileFailed.value = true
}

/**
 * The name to sync, prefilled with the first bound alias — the account whose
 * battles these are is almost always the one already on the profile.
 */
const syncName = ref(aliases.value[0] ?? '')

/** Unique per instance, so each label points at its own field. */
const linksInputId = useId()
const syncInputId = useId()

interface ReportRow {
  key: string
  label: string
  status: BatchOutcome['status'] | 'bad-link'
  detail: string
}

/** One sentence per reason, because "it failed" is not worth reading. */
function reasonOf(reason: string) {
  const messages: Record<string, string> = {
    'not-found': t('import.failed.notFound'),
    unavailable: t('import.failed.unavailable'),
    malformed: t('import.failed.malformed'),
    'store-failed': t('import.failed.storeFailed'),
    'write-failed': t('import.failed.writeFailed'),
  }

  return messages[reason] ?? reason
}

function detailOf(outcome: BatchOutcome) {
  if (outcome.status === 'failed') return reasonOf(outcome.reason)
  if (outcome.status === 'unparsed') return t('import.status.unparsedShort')

  return ''
}

/** Every line of the attempt: what was imported, and what never got that far. */
const rows = computed<ReportRow[]>(() => [
  ...(report.value?.items ?? []).map((item) => ({
    key: item.ref.id,
    label: item.ref.id,
    status: item.outcome.status,
    detail: detailOf(item.outcome),
  })),
  ...badLines.value.map((line, index) => ({
    key: `bad-${index}-${line}`,
    label: line,
    status: 'bad-link' as const,
    detail: t('import.badLink'),
  })),
])

/**
 * The one battle, when a single replay is all that was asked for. A batch
 * gets the list; one link gets the battle it just imported.
 */
const single = computed(() => {
  const items = report.value?.items ?? []
  if (items.length !== 1 || badLines.value.length) return null

  const outcome = items[0]!.outcome

  return outcome.status === 'imported' || outcome.status === 'unparsed' ? outcome : null
})

const battle = computed(() => single.value?.battle ?? null)
const spectated = computed(() => battle.value?.my_side === null)

/** The four (or fewer) that actually showed up, by name rather than by id. */
const bring = computed(() =>
  (battle.value?.bring_signature?.split('|') ?? []).filter(Boolean).map(speciesName),
)

const playedOn = computed(() =>
  battle.value ? new Date(battle.value.played_at).toLocaleDateString(locale.value) : '',
)

function reset() {
  report.value = null
  badLines.value = []
  failure.value = null
  truncated.value = false
}

/** The replays a pasted list names; every other line is kept to be reported. */
function refsOf(pasted: string): ReplayRef[] {
  const refs: ReplayRef[] = []

  const lines = pasted
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    // Parsed here rather than by Showdown: a line that could never be a
    // replay deserves a sentence about itself, not a 404 about a replay.
    const target = parseReplayLink(line)

    if (target) refs.push(target)
    else badLines.value.push(line)
  }

  return refs
}

/** Runs one attempt, with both entrances shut while it is in the air. */
async function run(work: () => Promise<void>) {
  busy.value = true
  try {
    await work()
  } finally {
    busy.value = false
  }
}

async function importPasted() {
  // Both forms talk to the same Showdown, so one at a time.
  if (busy.value || !loaded.value) return

  reset()
  const refs = refsOf(links.value)
  if (!refs.length) return

  await run(async () => {
    report.value = await importMany(refs)
  })
}

async function syncByName() {
  if (busy.value || !loaded.value) return

  reset()

  // A name that normalises to nothing could never match a replay, and
  // Showdown answers `user=` with the whole site's recent battles.
  if (!toID(syncName.value)) {
    failure.value = { reason: 'unusable-name', message: '' }
    return
  }

  await run(async () => {
    const outcome = await syncAccount(syncName.value)

    if (outcome.status === 'failed') {
      failure.value = { reason: outcome.reason, message: outcome.message }
      return
    }

    report.value = outcome.report
    truncated.value = outcome.truncated
  })
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

      <h2 class="text-xl font-semibold tracking-tight">{{ t('import.paste.title') }}</h2>
      <p class="mt-1 text-sm text-muted-foreground">{{ t('import.paste.tagline') }}</p>

      <form
        class="mt-3"
        :aria-label="t('import.paste.title')"
        data-testid="import-form"
        @submit.prevent="importPasted"
      >
        <label class="text-sm font-medium" :for="linksInputId">{{ t('import.label') }}</label>
        <textarea
          :id="linksInputId"
          v-model="links"
          rows="4"
          class="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
          :placeholder="t('import.placeholder')"
          :disabled="!loaded"
          autocapitalize="off"
          autocomplete="off"
          spellcheck="false"
          data-testid="import-input"
        />
        <UiButton
          type="submit"
          class="mt-2"
          :disabled="!loaded || busy"
          data-testid="import-submit"
        >
          {{ busy ? t('import.working') : t('import.submit') }}
        </UiButton>
      </form>

      <h2 class="mt-10 text-xl font-semibold tracking-tight">{{ t('import.sync.title') }}</h2>
      <p class="mt-1 text-sm text-muted-foreground">{{ t('import.sync.tagline') }}</p>

      <form
        class="mt-3 flex items-end gap-2"
        :aria-label="t('import.sync.title')"
        data-testid="sync-form"
        @submit.prevent="syncByName"
      >
        <div class="flex-1">
          <label class="text-sm font-medium" :for="syncInputId">{{ t('import.sync.label') }}</label>
          <input
            :id="syncInputId"
            v-model="syncName"
            class="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
            :placeholder="t('import.sync.placeholder')"
            :disabled="!loaded"
            autocapitalize="off"
            autocomplete="off"
            spellcheck="false"
            data-testid="sync-input"
          />
        </div>
        <UiButton type="submit" :disabled="!loaded || busy" data-testid="sync-submit">
          {{ busy ? t('import.working') : t('import.sync.submit') }}
        </UiButton>
      </form>

      <p v-if="failure" class="mt-4 text-sm text-destructive" data-testid="import-error">
        {{
          failure.reason === 'unusable-name' ? t('import.sync.unusable') : reasonOf(failure.reason)
        }}
      </p>

      <p
        v-if="truncated"
        class="mt-4 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
        data-testid="sync-truncated"
      >
        {{ t('import.sync.truncated') }}
      </p>

      <!-- Per replay, because a user needs to know why the twelve that failed failed. -->
      <template v-if="rows.length">
        <p class="mt-6 text-sm font-medium" data-testid="report-counts">
          {{
            t('import.report.counts', {
              imported: report?.counts.imported ?? 0,
              skipped: report?.counts.skipped ?? 0,
              failed: (report?.counts.failed ?? 0) + badLines.length,
            })
          }}
        </p>

        <ul class="mt-2 divide-y divide-border border-y border-border">
          <li
            v-for="row of rows"
            :key="row.key"
            class="flex items-baseline justify-between gap-4 py-2 text-sm"
            data-testid="report-row"
          >
            <span class="truncate font-mono">{{ row.label }}</span>
            <span
              class="shrink-0"
              :class="
                row.status === 'imported'
                  ? 'text-foreground'
                  : row.status === 'skipped'
                    ? 'text-muted-foreground'
                    : 'text-destructive'
              "
            >
              {{ t(`import.status.${row.status === 'bad-link' ? 'badLinkShort' : row.status}`) }}
              <span v-if="row.detail" class="text-muted-foreground">— {{ row.detail }}</span>
            </span>
          </li>
        </ul>
      </template>

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
          v-if="single?.status === 'unparsed'"
          class="mt-3 text-sm text-destructive"
          data-testid="import-unparsed"
        >
          {{ t('import.unparsed', { message: single.message }) }}
        </p>
      </article>
    </section>
  </main>
</template>
