<script setup lang="ts">
// The title shape and the tab icon, which every page shares (#139, #140).
// Here rather than in a layout: the two shells are chosen per page, and
// neither of these is a shell.
useSiteHead()
</script>

<template>
  <!--
    No markup of its own: the shell is a layout, and each page says which of
    the two it wants (issue #125). `<NuxtLayout>` reads that off the route, so
    nothing here has to know about it.
  -->
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
