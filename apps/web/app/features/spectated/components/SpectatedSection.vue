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
    <div
      class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2"
      data-testid="spectated-header"
    >
      <h2 class="text-xl font-semibold tracking-tight">{{ t('spectated.title') }}</h2>

      <!-- `basis-56` is what makes the wrap on the row above real: a flex item
           is put on a line by its basis, and `flex-1 min-w-0` alone would let
           this group shrink to a sliver beside the heading forever rather than
           ever take a line of its own. -->
      <div class="flex min-w-0 flex-1 basis-56 items-center justify-end gap-2">
        <!-- Beside the heading, because it searches this section and nothing
             else: the list above it is the reader's own battles and has its
             own filters.

             Its width is whatever the row has left rather than a number: the
             `w-48` it used to carry was 192px of a 320px screen, claimed
             before the heading and the count had asked for any (#215). -->
        <input
          :value="query"
          type="search"
          class="border-border bg-background focus-visible:ring-ring min-h-11 min-w-0 flex-1 rounded-md border px-2 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none"
          :placeholder="t('spectated.search')"
          :aria-label="t('spectated.search')"
          data-testid="spectated-search"
          @input="(event) => search((event.target as HTMLInputElement).value)"
        />
        <!-- Announced, because it and the message below are the only things
             that answer "did what I typed do anything". -->
        <p class="text-muted-foreground shrink-0 font-mono text-xs tabular-nums" aria-live="polite">
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
        class="hover:bg-muted/50 focus-visible:ring-ring flex min-h-11 w-full items-center gap-2 border-l-2 px-3 py-2 text-left focus-visible:ring-2 focus-visible:outline-none"
        :class="
          battle.replayId === battleRoute.openId.value
            ? 'border-l-primary bg-primary/5'
            : 'border-l-transparent'
        "
        data-testid="spectated-battle"
        @click="() => battleRoute.open(battle.replayId)"
      >
        <span class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5" data-testid="battle-meta">
            <!-- `min-w-0`: see the recent list's row. -->
            <span class="min-w-0 truncate font-medium">
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
          <span class="flex flex-wrap items-center gap-1" data-testid="battle-teams">
            <!-- The mark is inside the side it is about, not beside it: this
                 line wraps, and nobody here is "me", so a mark that drifted
                 between the two parties would name no winner at all. -->
            <span class="flex min-w-0 flex-wrap items-center gap-1" data-testid="battle-side">
              <SpeciesParty
                :signature="battle.sides.p1.team"
                :bring="battle.sides.p1.bring"
                :size="33"
              />
              <span
                v-if="battle.winner === 'p1'"
                class="text-primary shrink-0 font-mono text-[10px] tracking-widest uppercase"
                data-testid="side-won"
              >
                {{ t('battle.drawer.won') }}
              </span>
            </span>
            <span
              class="text-muted-foreground shrink-0 px-1 font-mono text-[10px]"
              data-testid="battle-versus"
            >
              {{ t('battle.drawer.versus') }}
            </span>
            <span class="flex min-w-0 flex-wrap items-center gap-1" data-testid="battle-side">
              <SpeciesParty
                :signature="battle.sides.p2.team"
                :bring="battle.sides.p2.bring"
                :size="33"
              />
              <span
                v-if="battle.winner === 'p2'"
                class="text-primary shrink-0 font-mono text-[10px] tracking-widest uppercase"
                data-testid="side-won"
              >
                {{ t('battle.drawer.won') }}
              </span>
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
      class="border-border text-muted-foreground hover:text-foreground focus-visible:ring-ring min-h-11 self-start rounded-md border px-3 py-1.5 text-xs focus-visible:ring-2 focus-visible:outline-none"
      data-testid="spectated-more"
      @click="showMore"
    >
      {{ t('spectated.more') }}
    </button>
  </section>
</template>
