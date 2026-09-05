<script setup lang="ts">
const { aliases, loaded, load } = useProfile()

// Started in setup and deliberately *not* awaited. The dashboard's own read is
// what this page is for and it is awaited inside the component; holding that
// behind a second round-trip would cost every visit a delay for the sake of a
// branch only an empty dashboard ever takes. Both reads are therefore in the
// air at once, and the empty state below waits for this one by asking whether
// it has landed rather than by assuming it has.
//
// The failure is swallowed on purpose: a profile that could not be read leaves
// `loaded` false, which is exactly the state the empty state treats as "do not
// accuse this reader of binding no name". Nothing else on this page needs it.
void load().catch(() => {})
</script>

<template>
  <!--
    The dashboard, and the drawer it opens. Two features meet here and nowhere
    else: the numbers are `features/stats`, the timeline behind one battle is
    `features/timeline`, and a page is where they are allowed to (issue #61).

    The alias list is `features/identity`, and the dashboard needs one bit of
    it: attribution is the alias list re-derived (ADR-0012), so an account with
    no name bound has imported nothing it can call its own, however many
    replays it imported (#129).
  -->
  <main class="flex flex-col gap-6 py-8">
    <StatsDashboardPage :aliases-bound="!loaded || aliases.length > 0" />

    <!--
      Outside the dashboard, not inside it: `StatsDashboardPage` collapses to
      "nothing here yet" when no battle of the reader's own survives the
      filters, and an account holding only other people's replays is exactly
      that account (issue #66).
    -->
    <SpectatedSection />

    <!-- Bound to `?battle=`, so it is open on arrival when the address says so. -->
    <BattleDrawer />
  </main>
</template>
