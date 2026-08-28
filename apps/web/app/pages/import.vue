<script setup lang="ts">
const { aliases, loaded, load } = useProfile()
const { refresh: refreshStats } = useStats()
const { refresh: refreshSpectated } = useSpectatedBattles()

const profileFailed = ref(false)

// Awaited in setup: the alias list decides which side of a battle is "me", so
// the form may not be on screen before it has arrived.
try {
  await load()
} catch {
  profileFailed.value = true
}

// Not awaited: the dashboard's rows are session state that this route never
// touched, so without this a hundred freshly imported battles would stay
// invisible until the user happened to reload — but nothing on this page is
// waiting to hear how that read went.
//
// Both lists, because a batch can land in either: a replay whose two players
// are both strangers is spectated and never reaches the dashboard (#66).
function onFinished() {
  void refreshStats()
  void refreshSpectated()
}
</script>

<template>
  <!--
    Importing replays is `features/ingest`; the alias list it needs and the two
    lists it invalidates are `features/identity`, `features/stats` and
    `features/spectated`. Four features meet here because a page is the only
    place they may (issue #61).
  -->
  <main class="py-8">
    <IngestImportPage
      :aliases
      :aliases-loaded="loaded"
      :aliases-failed="profileFailed"
      @finished="onFinished"
    />
  </main>
</template>
