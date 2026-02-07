<script setup lang="ts">
import type { AccessSource } from '@shared/types';

defineProps<{
  source: AccessSource;
}>();
</script>

<template>
  <!-- Override (Direct + Group) -->
  <v-chip
    v-if="source.type === 'multiple' && source.hasDirect"
    size="x-small"
    variant="tonal"
    color="orange"
    class="override-chip"
  >
    <v-icon start size="x-small">mdi-shield-edit</v-icon>
    Override + via {{ source.groups.join(', ') }}
  </v-chip>

  <!-- Direct only -->
  <span v-else-if="source.type === 'direct'" class="access-source-label">
    <v-icon size="x-small" class="mr-1">mdi-account</v-icon>
    Direct
  </span>

  <!-- Single Group -->
  <span v-else-if="source.type === 'group'" class="access-source-label">
    <v-icon size="x-small" class="mr-1">mdi-account-group</v-icon>
    via {{ source.groupName }}
  </span>

  <!-- Multiple Groups (no override) -->
  <span v-else-if="source.type === 'multiple'" class="access-source-label">
    <v-icon size="x-small" class="mr-1">mdi-layers</v-icon>
    via {{ source.groups.join(', ') }}
  </span>
</template>

<style scoped lang="scss">
.access-source-label {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  color: #9ca3af;
}

.override-chip {
  font-weight: 500;

  :deep(.v-chip__content) {
    font-size: 11px;
  }
}
</style>
