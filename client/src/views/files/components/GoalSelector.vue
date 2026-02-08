<script setup lang="ts">
import { ref, watch } from 'vue';

interface Props {
  modelValue: boolean;
  currentGoal: string | null;
  path: string;
  isDirectory: boolean;
  isSaving?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isSaving: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [goalName: string, recursive: boolean];
}>();

const goalName = ref('');
const recursive = ref(false);

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      goalName.value = props.currentGoal || '';
      recursive.value = false;
    }
  },
);

function handleSave(): void {
  if (!goalName.value) return;
  emit('save', goalName.value, recursive.value);
}

function handleClose(): void {
  emit('update:modelValue', false);
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="440"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title>
        <v-icon class="mr-2">mdi-target</v-icon>
        Set Storage Goal
      </v-card-title>

      <v-card-text>
        <div class="text-caption text-medium-emphasis mb-3">{{ path }}</div>

        <v-text-field
          v-model="goalName"
          label="Goal Name"
          variant="outlined"
          density="compact"
          placeholder="e.g., default_group_1, nearline_group_1"
          hint="Enter the name of the storage goal to assign"
          persistent-hint
          class="mb-3"
          autofocus
        />

        <v-checkbox
          v-if="isDirectory"
          v-model="recursive"
          label="Apply recursively to all contents"
          density="compact"
          hide-details
        />

        <v-alert
          v-if="props.currentGoal"
          type="info"
          variant="tonal"
          density="compact"
          class="mt-3"
        >
          Current goal: <strong>{{ props.currentGoal }}</strong>
        </v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn @click="handleClose" :disabled="props.isSaving">Cancel</v-btn>
        <v-btn
          color="primary"
          :loading="props.isSaving"
          :disabled="!goalName"
          @click="handleSave"
        >
          Apply
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
