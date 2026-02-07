<script setup lang="ts">
import { ref, watch } from 'vue';

interface Props {
  modelValue?: string;
  placeholder?: string;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: 'Search...',
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const localValue = ref(props.modelValue);
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.modelValue,
  (newVal) => {
    localValue.value = newVal;
  }
);

function onInput(value: string): void {
  localValue.value = value;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    emit('update:modelValue', value);
  }, 300);
}

function onClear(): void {
  localValue.value = '';
  emit('update:modelValue', '');
}
</script>

<template>
  <v-text-field
    :model-value="localValue"
    :placeholder="placeholder"
    prepend-inner-icon="mdi-magnify"
    variant="outlined"
    density="compact"
    hide-details
    clearable
    single-line
    class="search-bar"
    @update:model-value="onInput"
    @click:clear="onClear"
  />
</template>

<style scoped lang="scss">
.search-bar {
  max-width: 320px;
}
</style>
