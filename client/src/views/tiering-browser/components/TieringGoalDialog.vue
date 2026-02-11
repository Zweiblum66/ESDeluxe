<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useGoalsStore } from '@/stores/goals.store';

interface TargetEntry {
  path: string;
  type: string;
}

interface Props {
  modelValue: boolean;
  currentGoal: string | null;
  targets: TargetEntry[];
  /** Total size in bytes of the selected files/folders */
  selectedDataSize?: number;
  isSaving?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isSaving: false,
  selectedDataSize: 0,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [goalName: string, recursive: boolean];
}>();

const goalsStore = useGoalsStore();
const selectedGoal = ref('');
const recursive = ref(false);

const hasDirectories = computed(() =>
  props.targets.some((t) => t.type === 'directory'),
);

const targetLabel = computed(() => {
  if (props.targets.length === 0) return '';
  if (props.targets.length === 1) return props.targets[0].path;
  return `${props.targets.length} items`;
});

// Goal details for the currently selected goal
const selectedGoalInfo = computed(() => {
  if (!selectedGoal.value) return null;
  return goalsStore.goals.find((g) => g.name === selectedGoal.value) || null;
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      selectedGoal.value = props.currentGoal || '';
      recursive.value = false;
      if (goalsStore.goals.length === 0) {
        await goalsStore.fetchGoals();
      }
    }
  },
);

onMounted(async () => {
  if (goalsStore.goals.length === 0) {
    await goalsStore.fetchGoals();
  }
});

function handleSave(): void {
  if (!selectedGoal.value) return;
  emit('save', selectedGoal.value, recursive.value);
}

function handleClose(): void {
  emit('update:modelValue', false);
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="520" @update:model-value="emit('update:modelValue', $event)">
    <v-card>
      <v-card-title>
        <v-icon class="mr-2">mdi-target</v-icon>
        Set Storage Goal
      </v-card-title>

      <v-card-text>
        <!-- Target summary with data size -->
        <div class="tiering-goal-dialog__summary mb-4">
          <div class="d-flex align-center justify-space-between">
            <span class="text-caption text-medium-emphasis">
              {{ targetLabel }}
            </span>
            <v-chip
              v-if="props.selectedDataSize > 0"
              size="small"
              variant="tonal"
              color="info"
              label
            >
              {{ formatBytes(props.selectedDataSize) }}
            </v-chip>
          </div>
        </div>

        <!-- Goal selector with definition in dropdown -->
        <v-select
          v-model="selectedGoal"
          :items="goalsStore.goals"
          item-title="name"
          item-value="name"
          label="Storage Goal"
          variant="outlined"
          density="compact"
          :loading="goalsStore.isLoading"
          hint="Select the storage goal to assign"
          persistent-hint
          class="mb-3"
        >
          <template #item="{ item, props: itemProps }">
            <v-list-item v-bind="itemProps">
              <template #append>
                <span class="text-caption text-medium-emphasis">{{ item.raw.definition }}</span>
              </template>
            </v-list-item>
          </template>
        </v-select>

        <!-- Selected goal details -->
        <v-alert
          v-if="selectedGoalInfo"
          variant="tonal"
          density="compact"
          color="primary"
          class="mb-3"
        >
          <div class="d-flex align-center justify-space-between">
            <div>
              <div class="text-body-2 font-weight-medium">{{ selectedGoalInfo.name }}</div>
              <div class="text-caption text-medium-emphasis">
                Definition: {{ selectedGoalInfo.definition }}
              </div>
            </div>
            <div class="d-flex ga-2">
              <v-chip v-if="selectedGoalInfo.writeable" size="x-small" color="success" variant="tonal" label>
                Writeable
              </v-chip>
              <v-chip v-else size="x-small" color="warning" variant="tonal" label>
                Read-only
              </v-chip>
              <v-chip v-if="selectedGoalInfo.isUsed" size="x-small" color="info" variant="tonal" label>
                In use
              </v-chip>
            </div>
          </div>
        </v-alert>

        <!-- Recursive option -->
        <v-checkbox
          v-if="hasDirectories"
          v-model="recursive"
          label="Apply recursively to all contents"
          density="compact"
          hide-details
        />

        <!-- Current goal info -->
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
          :disabled="!selectedGoal"
          @click="handleSave"
        >
          Apply
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.tiering-goal-dialog__summary {
  padding: 8px 12px;
  background: rgba(55, 65, 81, 0.2);
  border-radius: 6px;
}
</style>
