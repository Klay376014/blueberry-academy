<script setup lang="ts">
const { refresh: refreshStats } = useStats()
const { refresh: refreshSpectated } = useSpectatedBattles()

// Not awaited: the rows the dashboard holds are session state this route never
// touched, and battles just claimed by a newly bound name are not in them —
// but nothing on this page is waiting to hear how that read went.
//
// Both lists, and in both directions: attribution is the alias list re-derived
// (ADR-0012), so binding a name takes battles out of the spectated list and
// unbinding one hands them back to it (#66).
function onReattributed() {
  void refreshStats()
  void refreshSpectated()
}
</script>

<template>
  <!--
    Binding a name is `features/identity`; the two lists it invalidates are
    `features/stats` and `features/spectated`. Three features meet here because
    a page is the only place they may (ADR-0013).
  -->
  <IdentitySettingsPage @reattributed="onReattributed" />
</template>
