<script setup lang="ts">
const { aliases, loaded, load } = useProfile()
const { refresh: refreshStats } = useStats()

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
function onFinished() {
  void refreshStats()
}
</script>

<template>
  <!--
    Importing replays is `features/ingest`; the alias list it needs and the
    dashboard it invalidates are `features/identity` and `features/stats`. Three
    features meet here because a page is the only place they may (issue #61).
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
