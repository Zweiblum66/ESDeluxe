<script setup lang="ts">
interface Props {
  label: string;
  color?: string;
  icon?: string;
  size?: 'x-small' | 'small' | 'default' | 'large';
}

withDefaults(defineProps<Props>(), {
  color: 'secondary',
  icon: undefined,
  size: 'small',
});
</script>

<template>
  <v-chip
    :color="color"
    :size="size"
    variant="tonal"
    label
  >
    <v-icon v-if="icon" start size="14">{{ icon }}</v-icon>
    {{ label }}
  </v-chip>
</template>
