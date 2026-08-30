<script setup lang="ts">
/**
 * The dashboard's global filters, shared by every section that reads
 * `useStatsFilters()` — one bar rather than one per section, so a format and
 * a date range are set once (design document §7).
 *
 * Native selects and inputs rather than a component library's: they are
 * keyboard- and screen-reader-correct as they come, and open the platform's
 * own date picker on a phone.
 */
defineProps<{ formats: string[]; identities: string[] }>()

const { t } = useI18n()
const filters = useStatsFilters()

const fieldId = useId()

function valueOf(event: Event): string {
  return (event.target as HTMLSelectElement | HTMLInputElement).value
}

function pickIdentity(event: Event) {
  filters.value.identity = valueOf(event)
}

function pickFormat(event: Event) {
  filters.value.formatId = valueOf(event)
}

function pickFrom(event: Event) {
  filters.value.from = valueOf(event) || null
}

function pickTo(event: Event) {
  filters.value.to = valueOf(event) || null
}

function toggleIncomplete(event: Event) {
  filters.value.includeIncompleteBrings = (event.target as HTMLInputElement).checked
}
</script>

<template>
  <section
    class="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-lg border border-border bg-card p-3"
    :aria-label="t('filters.title')"
  >
    <div class="flex flex-col gap-1">
      <label :for="`${fieldId}-identity`" class="text-xs text-muted-foreground">
        {{ t('filters.identity') }}
      </label>
      <select
        :id="`${fieldId}-identity`"
        :value="filters.identity ?? ''"
        class="h-9 rounded-md border border-input bg-background px-2 text-sm"
        data-testid="filter-identity"
        @change="pickIdentity"
      >
        <option v-for="name of identities" :key="name" :value="name">{{ name }}</option>
      </select>
    </div>

    <div class="flex flex-col gap-1">
      <label :for="`${fieldId}-format`" class="text-xs text-muted-foreground">
        {{ t('filters.format') }}
      </label>
      <select
        :id="`${fieldId}-format`"
        :value="filters.formatId ?? ''"
        class="h-9 rounded-md border border-input bg-background px-2 font-mono text-xs"
        data-testid="filter-format"
        @change="pickFormat"
      >
        <option v-for="id of formats" :key="id" :value="id">{{ id }}</option>
      </select>
    </div>

    <div class="flex flex-col gap-1">
      <label :for="`${fieldId}-from`" class="text-xs text-muted-foreground">
        {{ t('filters.from') }}
      </label>
      <input
        :id="`${fieldId}-from`"
        type="date"
        :value="filters.from ?? ''"
        class="h-9 rounded-md border border-input bg-background px-2 text-sm"
        data-testid="filter-from"
        @change="pickFrom"
      />
    </div>

    <div class="flex flex-col gap-1">
      <label :for="`${fieldId}-to`" class="text-xs text-muted-foreground">
        {{ t('filters.to') }}
      </label>
      <input
        :id="`${fieldId}-to`"
        type="date"
        :value="filters.to ?? ''"
        class="h-9 rounded-md border border-input bg-background px-2 text-sm"
        data-testid="filter-to"
        @change="pickTo"
      />
    </div>

    <label class="flex h-9 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
      <input
        type="checkbox"
        :checked="filters.includeIncompleteBrings"
        class="size-4 cursor-pointer accent-primary"
        data-testid="filter-incomplete"
        @change="toggleIncomplete"
      />
      {{ t('filters.includeIncomplete') }}
    </label>
  </section>
</template>
