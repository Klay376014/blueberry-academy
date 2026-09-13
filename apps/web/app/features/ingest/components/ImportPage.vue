<script setup lang="ts">
import { toID } from 'replay-parser'
import type { BatchItem, BatchOutcome, ImportReport } from '../composables/useIngest'
import type { ReplayRef } from '~/shared/api/showdown'

const props = defineProps<{
  /** Every Showdown name bound to the reader; the first one prefills the sync form. */
  aliases: string[]
  /** The alias list decides which side of a battle is "me", so neither form
   * may be usable before it has arrived. */
  aliasesLoaded: boolean
  /** The alias list could not be read at all. */
  aliasesFailed: boolean
}>()

const emit = defineEmits<{
  /** One attempt has been answered — some battles may now be new. */
  finished: []
}>()

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { importMany, syncAccount, syncPrivate } = useIngest()

/** One line per replay, the way a pasted list arrives. */
const links = ref('')
const busy = ref(false)

/**
 * Every replay this attempt has heard back about, in the order it heard —
 * appended as each one lands rather than all at the end, because a sync of a
 * thousand battles is a long time to show nothing (design document §8, Q26).
 */
const items = ref<BatchItem[]>([])
/** How many replays this attempt will work through; null until it is known. */
const total = ref<number | null>(null)
/**
 * What a paste that named no replay at all held — listed so the reader can see
 * what was passed over instead of an empty report.
 */
const badLines = ref<string[]>([])
/** How many more lines that paste held than the report lists. */
const ignoredRest = ref(0)
/** A failure of the whole attempt: nothing was listed, so nothing was tried. */
const failure = ref<{ reason: string; message: string } | null>(null)

/**
 * Which listing ran out, because the two run out for different reasons and
 * only one of them is worth trying again: an account sync reaches the end of
 * Showdown's search pages, a private sync reaches this Worker's subrequest
 * budget.
 */
const truncated = ref<'account' | 'private' | null>(null)

/**
 * The name to sync, prefilled with the first bound alias — the account whose
 * battles these are is almost always the one already on the profile.
 */
const syncName = ref(props.aliases[0] ?? '')

/**
 * The private form's own pair. The name is prefilled like the one above it;
 * the password is never prefilled and never kept — it is cleared the moment
 * the attempt is over (design document §5).
 */
const privateName = ref(props.aliases[0] ?? '')
const privatePassword = ref('')

/** Unique per instance, so each label points at its own field. */
const linksInputId = useId()
const syncInputId = useId()
const privateNameId = useId()
const privatePasswordId = useId()

/**
 * Showdown only lets an account list its own private replays (§2.2.6), so a
 * name the reader has not bound here could only ever come back refused — and
 * refused by Showdown, after the password has already been sent, in wording
 * written for somebody else.
 */
const boundIds = computed(() => new Set(props.aliases.map((alias) => toID(alias))))

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
    'signed-out': t('import.failed.signedOut'),
    rejected: t('import.failed.rejected'),
  }

  return messages[reason] ?? reason
}

function detailOf(outcome: BatchOutcome) {
  if (outcome.status === 'failed') return reasonOf(outcome.reason)
  if (outcome.status === 'unparsed') return t('import.status.unparsedShort')

  return ''
}

/** Counted here rather than taken from the report, so the tally moves too. */
const counts = computed(() => {
  const tally = { imported: 0, unparsed: 0, skipped: 0, failed: 0 }
  for (const item of items.value) tally[item.outcome.status] += 1

  return tally
})

/** Every line of the attempt: what was imported, and what never got that far. */
const rows = computed<ReportRow[]>(() => [
  ...items.value.map((item) => ({
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
  if (busy.value || items.value.length !== 1 || badLines.value.length) return null

  const outcome = items.value[0]!.outcome

  return outcome.status === 'imported' || outcome.status === 'unparsed' ? outcome : null
})

const battle = computed(() => single.value?.battle ?? null)
const spectated = computed(() => battle.value?.my_side === null)

/**
 * An `unparsed` row is deliberately not here. It has no attribution either,
 * but because the log could not be read rather than because of the alias list
 * — and blaming the list for it would point the reader at a name that was
 * never the problem. `import.unparsed` says what actually happened.
 */
const importedBattles = computed(() =>
  items.value.flatMap((item) => (item.outcome.status === 'imported' ? [item.outcome.battle] : [])),
)

/**
 * The batch went in and not one of the battles is the reader's. Attribution is
 * the alias list re-derived (ADR-0012), so this is what importing before
 * binding a name looks like: thirty replays in, thirty spectated battles, and
 * a dashboard that stays empty (#129).
 *
 * Said whether or not a name is already bound. The reader who has one and
 * imported a stranger's replays on purpose is told something they knew; the
 * reader who bound the wrong name, or played under a second one, is the harder
 * case to be left in silence.
 */
const allSpectated = computed(
  () =>
    !busy.value &&
    !single.value &&
    importedBattles.value.length > 0 &&
    importedBattles.value.every((row) => row.my_side === null),
)

/** The four (or fewer) that actually showed up, by name rather than by id. */
const bring = computed(() =>
  (battle.value?.bring_signature?.split('|') ?? []).filter(Boolean).map(speciesName),
)

const playedOn = computed(() =>
  battle.value ? new Date(battle.value.played_at).toLocaleDateString(locale.value) : '',
)

/** How full the bar is. An empty account is finished the moment it is listed. */
const percentDone = computed(() =>
  total.value ? Math.round((items.value.length / total.value) * 100) : 100,
)

/**
 * Kept pinned to the newest line while the batch is running, which is what
 * makes it a live feed rather than a list that quietly grows off-screen — but
 * only while the user is already at the bottom. Scrolling up to read why one
 * failed is exactly what this list is for, and yanking them back down every
 * time a replay lands would make that impossible.
 */
const list = useTemplateRef<HTMLElement>('list')
const NEAR_BOTTOM = 40

watch(
  () => items.value.length,
  async () => {
    const element = list.value
    if (!busy.value || !element) return

    const pinned = element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_BOTTOM

    await nextTick()
    if (pinned) element.scrollTop = element.scrollHeight
  },
)

/**
 * The two callbacks every attempt hands to useIngest. The final report is
 * absorbed rather than assigned: a replay already listed live must not appear
 * a second time, and the order the user watched things arrive in should not
 * be shuffled at the finish.
 */
const watching = {
  onTotal: (count: number) => {
    total.value = count
  },
  onResult: (item: BatchItem) => {
    items.value = [...items.value, item]
  },
}

function absorb(finished: ImportReport) {
  const seen = new Set(items.value.map((item) => item.ref.id))
  items.value = [...items.value, ...finished.items.filter((item) => !seen.has(item.ref.id))]
}

function reset() {
  items.value = []
  total.value = null
  badLines.value = []
  ignoredRest.value = 0
  failure.value = null
  truncated.value = null
}

/** Enough ignored lines to recognise the paste by; a chat log is not a report. */
const IGNORED_SHOWN = 20

/**
 * The replays a pasted text names.
 *
 * Nothing is reported line by line while a link was found: the text is scanned
 * rather than matched line by line now, and a chat log's timestamps and
 * usernames are the expected company of a link, not replays that failed. A
 * paste that named no replay at all is the one case still worth listing —
 * silence there would leave a mistyped link looking like a finished import.
 */
function refsOf(pasted: string): ReplayRef[] {
  const refs = findReplayLinks(pasted)
  if (refs.length) return refs

  const lines = pasted
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  badLines.value = lines.slice(0, IGNORED_SHOWN)
  ignoredRest.value = lines.length - badLines.value.length

  return refs
}

/** Runs one attempt, with both entrances shut while it is in the air. */
async function run(work: () => Promise<void>) {
  busy.value = true
  try {
    await work()
    emit('finished')
  } finally {
    busy.value = false
  }
}

async function importPasted() {
  // Both forms talk to the same Showdown, so one at a time.
  if (busy.value || !props.aliasesLoaded) return

  reset()
  const refs = refsOf(links.value)
  if (!refs.length) return

  await run(async () => {
    absorb(await importMany(refs, watching))
  })
}

async function syncByName() {
  if (busy.value || !props.aliasesLoaded) return

  reset()

  // A name that normalises to nothing could never match a replay, and
  // Showdown answers `user=` with the whole site's recent battles.
  if (!toID(syncName.value)) {
    failure.value = { reason: 'unusable-name', message: '' }
    return
  }

  await run(async () => {
    const outcome = await syncAccount(syncName.value, watching)

    if (outcome.status === 'failed') {
      failure.value = { reason: outcome.reason, message: outcome.message }
      return
    }

    absorb(outcome.report)
    if (outcome.truncated) truncated.value = 'account'
  })
}

/**
 * The third entrance: the replays no search will admit to. The listing goes
 * through our own Worker (design document §2.1); everything after it is the
 * same pipeline as the other two.
 */
async function syncPrivateReplays() {
  if (busy.value || !props.aliasesLoaded) return

  reset()

  // Out of the field first, before anything can return early. A password left
  // in a form is one refresh away from a password manager offering to keep
  // it, and the likeliest way to leave this function early is a typo in the
  // name — exactly when the password has just been typed.
  const password = privatePassword.value
  privatePassword.value = ''

  if (!boundIds.value.has(toID(privateName.value))) {
    failure.value = { reason: 'not-bound', message: '' }
    return
  }

  // Asked here rather than by sending it: an empty password can only come
  // back as the route refusing the body, and the reader would be told to
  // check something Showdown never saw.
  if (!password) {
    failure.value = { reason: 'no-password', message: '' }
    return
  }

  await run(async () => {
    const outcome = await syncPrivate(privateName.value, password, watching)

    if (outcome.status === 'failed') {
      failure.value = { reason: outcome.reason, message: outcome.message }
      return
    }

    absorb(outcome.report)
    if (outcome.truncated) truncated.value = 'private'
  })
}
</script>

<template>
  <h1 class="text-3xl font-semibold tracking-tight">{{ t('import.title') }}</h1>
  <p class="mt-2 text-muted-foreground">{{ t('import.tagline') }}</p>

  <section class="mt-8 max-w-prose">
    <p v-if="aliasesFailed" class="text-sm text-destructive" data-testid="import-profile-error">
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
        :disabled="!aliasesLoaded"
        autocapitalize="off"
        autocomplete="off"
        spellcheck="false"
        data-testid="import-input"
      />
      <UiButton
        type="submit"
        class="mt-2"
        :disabled="!aliasesLoaded || busy"
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
          :disabled="!aliasesLoaded"
          autocapitalize="off"
          autocomplete="off"
          spellcheck="false"
          data-testid="sync-input"
        />
      </div>
      <UiButton type="submit" :disabled="!aliasesLoaded || busy" data-testid="sync-submit">
        {{ busy ? t('import.working') : t('import.sync.submit') }}
      </UiButton>
    </form>

    <h2 class="mt-10 text-xl font-semibold tracking-tight">{{ t('import.private.title') }}</h2>
    <p class="mt-1 text-sm text-muted-foreground">{{ t('import.private.tagline') }}</p>

    <!-- Above the fields, not below them: the reader is about to type a
         Showdown password into something that is not Showdown, and being told
         afterwards is no use to them (design document §5, "沒有技術解的一項"). -->
    <div
      class="mt-3 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
      data-testid="private-disclosure"
    >
      <p class="font-medium text-foreground">{{ t('import.private.disclosure.title') }}</p>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        <li>{{ t('import.private.disclosure.where') }}</li>
        <li>{{ t('import.private.disclosure.session') }}</li>
        <li>{{ t('import.private.disclosure.killSwitch') }}</li>
        <li>{{ t('import.private.disclosure.habit') }}</li>
      </ul>
    </div>

    <form
      class="mt-3 flex flex-wrap items-end gap-2"
      :aria-label="t('import.private.title')"
      data-testid="private-form"
      @submit.prevent="syncPrivateReplays"
    >
      <div class="min-w-40 flex-1">
        <label class="text-sm font-medium" :for="privateNameId">
          {{ t('import.private.nameLabel') }}
        </label>
        <input
          :id="privateNameId"
          v-model="privateName"
          class="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
          :disabled="!aliasesLoaded"
          autocapitalize="off"
          autocomplete="off"
          spellcheck="false"
          data-testid="private-name"
        />
      </div>
      <div class="min-w-40 flex-1">
        <label class="text-sm font-medium" :for="privatePasswordId">
          {{ t('import.private.passwordLabel') }}
        </label>
        <!-- `autocomplete="off"` rather than `current-password`: the browser
             offering to keep a Showdown password under our address is the
             habit the note above is about, and inviting it would be worse
             than the hint being only a hint. -->
        <input
          :id="privatePasswordId"
          v-model="privatePassword"
          type="password"
          class="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
          :disabled="!aliasesLoaded"
          autocapitalize="off"
          autocomplete="off"
          spellcheck="false"
          data-testid="private-password"
        />
      </div>
      <UiButton type="submit" :disabled="!aliasesLoaded || busy" data-testid="private-submit">
        {{ busy ? t('import.private.working') : t('import.private.submit') }}
      </UiButton>
    </form>

    <p v-if="failure" class="mt-4 text-sm text-destructive" data-testid="import-error">
      {{
        failure.reason === 'unusable-name'
          ? t('import.sync.unusable')
          : failure.reason === 'not-bound'
            ? t('import.private.notBound')
            : failure.reason === 'no-password'
              ? t('import.private.noPassword')
              : reasonOf(failure.reason)
      }}
    </p>

    <p
      v-if="truncated === 'account'"
      class="mt-4 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
      data-testid="sync-truncated"
    >
      {{ t('import.sync.truncated') }}
    </p>

    <!-- A different ceiling, and one with no way out from here: the listing
         always starts at page one, so running it again re-lists the same
         pages. Saying "try again" would be a loop. -->
    <p
      v-else-if="truncated === 'private'"
      class="mt-4 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
      data-testid="private-truncated"
    >
      {{ t('import.private.truncated') }}
    </p>

    <!-- While the batch is in the air: how far along, out of how many. A
         sync has no denominator until Showdown has answered the listing, and
         a bar at 0 / 0 would read as nothing happening. -->
    <div
      v-if="busy"
      class="mt-6"
      role="progressbar"
      :aria-label="t('import.progress.label')"
      :aria-valuenow="total === null ? undefined : items.length"
      :aria-valuemin="total === null ? undefined : 0"
      :aria-valuemax="total === null ? undefined : total"
      :aria-valuetext="total === null ? t('import.progress.listing') : undefined"
      data-testid="import-progress"
    >
      <div class="flex items-baseline justify-between gap-4 text-sm">
        <span class="text-muted-foreground">
          {{
            total === null
              ? t('import.progress.listing')
              : t('import.progress.counting', { done: items.length, total })
          }}
        </span>
      </div>
      <div class="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div v-if="total === null" class="h-full w-1/4 animate-pulse rounded-full bg-primary" />
        <div
          v-else
          class="h-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
          :style="{ width: `${percentDone}%` }"
        />
      </div>
    </div>

    <!-- Above the per-replay list, because every line of that list says
         "Imported" and the batch still went nowhere. The alias list decided
         this and the reader is the only one who can change it, so the way out
         is part of the sentence. -->
    <p
      v-if="allSpectated"
      class="mt-6 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
      data-testid="import-all-spectated"
    >
      {{ t('import.allSpectated') }}
      <NuxtLink :to="localePath('/settings')" class="text-primary underline">
        {{ t('import.bindAction') }}
      </NuxtLink>
    </p>

    <!-- Per replay, because a user needs to know why the twelve that failed failed. -->
    <template v-if="rows.length">
      <p class="mt-6 text-sm font-medium" data-testid="report-counts">
        {{
          t('import.report.counts', {
            imported: counts.imported,
            skipped: counts.skipped,
            failed: counts.failed + badLines.length,
          })
        }}
      </p>

      <!-- Capped and scrolled: a thousand rows would push everything else
           off the page, and the list has to stay readable after the fact. -->
      <ul
        ref="list"
        class="mt-2 max-h-96 divide-y divide-border overflow-y-auto border-y border-border"
        data-testid="report-list"
      >
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

      <p v-if="ignoredRest" class="mt-2 text-sm text-muted-foreground" data-testid="ignored-more">
        {{ t('import.ignoredMore', { count: ignoredRest }) }}
      </p>
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
           fix it — so say what happened rather than showing an empty row, and
           carry the same way out the batch-wide note does (#129). -->
      <p v-if="spectated" class="mt-1 text-sm text-muted-foreground" data-testid="battle-spectated">
        {{ t('import.battle.spectated') }}
        <NuxtLink :to="localePath('/settings')" class="text-primary underline">
          {{ t('import.bindAction') }}
        </NuxtLink>
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
</template>
