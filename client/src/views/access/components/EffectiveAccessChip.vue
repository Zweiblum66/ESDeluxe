<script setup lang="ts">
import type { SpaceAccessType } from '@shared/types';

defineProps<{
  effectiveAccess: SpaceAccessType | 'none';
}>();

function accessColor(access: string): string {
  if (access === 'readwrite' || access === 'admin') return 'success';
  if (access === 'readonly') return 'warning';
  return 'default';
}

function accessIcon(access: string): string {
  if (access === 'readwrite' || access === 'admin') return 'mdi-pencil';
  if (access === 'readonly') return 'mdi-eye-outline';
  return 'mdi-cancel';
}

function accessLabel(access: string): string {
  if (access === 'admin') return 'readwrite';
  return access;
}
</script>

<template>
  <v-chip
    :color="accessColor(effectiveAccess)"
    size="small"
    variant="tonal"
    label
  >
    <v-icon start size="x-small">{{ accessIcon(effectiveAccess) }}</v-icon>
    {{ accessLabel(effectiveAccess) }}
  </v-chip>
</template>
