<script setup lang="ts">
import { bestOfLabel } from '~/shared/utils/formatLabel'

/**
 * The battles this account imported and neither player of which is the reader.
 *
 * It sits on the page beside the dashboard rather than inside it, and that is
 * the point of it: the dashboard collapses to "nothing here yet" when no
 * battle of the reader's own survives the filters, and it takes every section
 * under it down. An account that has only ever imported other people's replays
 * is exactly that account, and it is the one this section exists for (#66).
 *
 * The row is shaped like the recent list's so nobody has to learn a second
 * one, and it opens the same drawer. What it cannot borrow is the wording:
 * there is no "me" here, so both sides are named and the winner is marked
 * neutrally.
 */
const {
  visible,
  battles,
  matches,
  noMatches,
  query,
  search,
  hasMore,
  showMore,
  error,
  whenLoaded,
} = useSpectatedBattles()
// Opening a battle is a query parameter, and the timeline is what reads it
// (issue #61).
const battleRoute = useBattleRoute()

const { t } = useI18n()

// Started in setup and deliberately *not* awaited, unlike the dashboard's own
// read. That one is what the page is for; this read is unbounded — every
// spectated battle, `details` and all, because silently showing the first
// thousand of them would be worse than an error — and the two share a Suspense
// boundary, so awaiting it here would hold the whole page behind it. The
// section is absent until its rows arrive, which is the same thing it does for
// an account that watched none.
void whenLoaded()

const day = (playedAt: string) => new Date(playedAt).toLocaleDateString()
</script>

<template>
  <p v-if="error" class="text-destructive text-sm" data-testid="spectated-error">
    {{ t('spectated.failed') }}
  </p>

  <section
    v-else-if="battles.length"
    class="flex flex-col gap-3"
    :aria-label="t('spectated.title')"
    data-testid="spectated"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-3">
      <h2 class="text-xl font-semibold tracking-tight">{{ t('spectated.title') }}</h2>

      <div class="flex items-baseline gap-3">
        <!-- Beside the heading, because it searches this section and nothing
             else: the list above it is the reader's own battles and has its
             own filters. -->
        <input
          :value="query"
          type="search"
          class="border-border bg-background focus-visible:ring-ring w-48 rounded-md border px-2 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none"
          :placeholder="t('spectated.search')"
          :aria-label="t('spectated.search')"
          data-testid="spectated-search"
          @input="(event) => search((event.target as HTMLInputElement).value)"
        />
        <!-- Announced, because it and the message below are the only things
             that answer "did what I typed do anything". -->
        <p class="text-muted-foreground font-mono text-xs tabular-nums" aria-live="polite">
          {{ matches.length }}
        </p>
      </div>
    </div>

    <!-- Said out loud, because the filters are directly above this and a
         reader who narrows the dates and sees this list stay put would
         otherwise read it as the filters being broken. -->
    <p class="text-muted-foreground text-xs" data-testid="spectated-note">
      {{ t('spectated.note') }}
    </p>

    <!-- Nothing to frame when a search found nothing: an empty bordered box
         above the message would read as a list that failed to draw. -->
    <div
      v-if="visible.length"
      class="border-border divide-border divide-y overflow-hidden rounded-lg border"
      data-testid="spectated-list"
    >
      <button
        v-for="battle of visible"
        :key="battle.replayId"
        type="button"
        class="hover:bg-muted/50 focus-visible:ring-ring flex w-full items-center gap-3 border-l-2 px-3 py-2 text-left focus-visible:ring-2 focus-visible:outline-none"
        :class="
          battle.replayId === battleRoute.openId.value
            ? 'border-l-primary bg-primary/5'
            : 'border-l-transparent'
        "
        data-testid="spectated-battle"
        @click="() => battleRoute.open(battle.replayId)"
      >
        <span class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="flex flex-wrap items-baseline gap-2">
            <span class="truncate font-medium">
              {{ battle.sides.p1.username ?? t('battle.drawer.unknownPlayer') }}
              <span class="text-muted-foreground text-xs">{{ t('battle.drawer.versus') }}</span>
              {{ battle.sides.p2.username ?? t('battle.drawer.unknownPlayer') }}
            </span>
            <span class="text-muted-foreground text-xs">
              {{ day(battle.playedAt) }} · {{ bestOfLabel(battle.formatId) }}
              <template v-if="battle.turnCount !== null">
                · {{ t('battle.recent.turns', { count: battle.turnCount }) }}
              </template>
            </span>
          </span>

          <!-- The winner is marked here rather than beside the name, for the
               reason the drawer's header marks it here: that line truncates,
               and the mark would be the first thing the ellipsis ate. -->
          <span class="flex flex-wrap items-center gap-1">
            <SpeciesParty
              :signature="battle.sides.p1.team"
              :bring="battle.sides.p1.bring"
              :size="33"
            />
            <span
              v-if="battle.winner === 'p1'"
              class="text-primary font-mono text-[10px] tracking-widest uppercase"
              data-testid="side-won"
            >
              {{ t('battle.drawer.won') }}
            </span>
            <span class="text-muted-foreground px-1 font-mono text-[10px]">
              {{ t('battle.drawer.versus') }}
            </span>
            <SpeciesParty
              :signature="battle.sides.p2.team"
              :bring="battle.sides.p2.bring"
              :size="33"
            />
            <span
              v-if="battle.winner === 'p2'"
              class="text-primary font-mono text-[10px] tracking-widest uppercase"
              data-testid="side-won"
            >
              {{ t('battle.drawer.won') }}
            </span>
          </span>
        </span>
      </button>
    </div>

    <!-- Said in the reader's own words, so it cannot be read as "this account
         has watched no battles" — which is the state where this whole section
         is absent. -->
    <p
      v-if="noMatches"
      class="text-muted-foreground text-sm"
      aria-live="polite"
      data-testid="spectated-no-matches"
    >
      {{ t('spectated.noMatches', { query }) }}
    </p>

    <!-- Every spectated battle is already in memory; this is about how many
         DOM nodes are drawn at once, not about what was read. -->
    <button
      v-if="hasMore"
      type="button"
      class="border-border text-muted-foreground hover:text-foreground focus-visible:ring-ring self-start rounded-md border px-3 py-1.5 text-xs focus-visible:ring-2 focus-visible:outline-none"
      data-testid="spectated-more"
      @click="showMore"
    >
      {{ t('spectated.more') }}
    </button>
  </section>
</template>
