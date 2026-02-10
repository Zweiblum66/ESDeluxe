<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useUsersStore } from '@/stores/users.store';
import { useGroupsStore } from '@/stores/groups.store';
import type { IPool, IConsumer } from '@shared/types';

interface Props {
  pool: IPool;
  poolIndex: number;
  isFirst: boolean;
  isLast: boolean;
  usage?: number;
}

interface Emits {
  (e: 'update', pool: IPool): void;
  (e: 'delete'): void;
  (e: 'add-above'): void;
  (e: 'add-below'): void;
  (e: 'move-up'): void;
  (e: 'move-down'): void;
  (e: 'remove-consumer', index: number): void;
  (e: 'add-consumer', consumers: IConsumer[]): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const usersStore = useUsersStore();
const groupsStore = useGroupsStore();

// Local state for editing
const poolName = ref(props.pool.name);
const bandwidthEnabled = ref(props.pool.bandwidthLimit !== null);
const bandwidthLimitMiB = ref(
  props.pool.bandwidthLimit ? Math.round(props.pool.bandwidthLimit / 1048576) : 500,
);

// Collapse state
const isCollapsed = ref(false);

// Consumer dialog
const showConsumerDialog = ref(false);
const consumerType = ref<'user' | 'group' | 'address' | 'workstation'>('user');
const consumerValue = ref('');
const selectedConsumers = ref<string[]>([]);

// Sync local state when pool prop changes (e.g. after reorder)
watch(() => props.pool.name, (newName) => { poolName.value = newName; });
watch(() => props.pool.bandwidthLimit, (newLimit) => {
  bandwidthEnabled.value = newLimit !== null;
  bandwidthLimitMiB.value = newLimit ? Math.round(newLimit / 1048576) : 500;
});

// Computed
const usageMiB = computed(() => (props.usage ?? 0) / 1048576);
const usagePercent = computed(() => {
  if (!props.pool.bandwidthLimit || !props.usage) return 0;
  return Math.min(100, (props.usage / props.pool.bandwidthLimit) * 100);
});

const collapsedSummary = computed(() => {
  const parts: string[] = [];
  if (props.pool.bandwidthLimit) {
    parts.push(`${Math.round(props.pool.bandwidthLimit / 1048576)} MiB/s`);
  } else {
    parts.push('Unlimited');
  }
  const count = props.pool.consumers.length;
  parts.push(`${count} consumer${count !== 1 ? 's' : ''}`);
  return parts.join(' · ');
});

// Update pool when values change
function emitUpdate() {
  const pool: IPool = {
    name: poolName.value,
    bandwidthLimit: bandwidthEnabled.value ? bandwidthLimitMiB.value * 1048576 : null,
    consumers: props.pool.consumers,
  };
  emit('update', pool);
}

function getConsumerLabel(consumer: IConsumer): string {
  switch (consumer.type) {
    case 'user':
      return consumer.user ?? '';
    case 'group':
      return consumer.group ?? '';
    case 'address':
      return consumer.address ?? '';
    case 'workstation':
      return consumer.workstation ?? '';
    default:
      return '';
  }
}

function getConsumerIcon(type: string): string {
  switch (type) {
    case 'user':
      return 'mdi-account';
    case 'group':
      return 'mdi-account-group';
    case 'address':
      return 'mdi-ip-network';
    case 'workstation':
      return 'mdi-desktop-classic';
    default:
      return 'mdi-help';
  }
}

// Load data when dialog opens
function openConsumerDialog() {
  showConsumerDialog.value = true;
  selectedConsumers.value = [];
  consumerValue.value = '';

  // Load users/groups if not already loaded
  if (consumerType.value === 'user' && usersStore.users.length === 0) {
    usersStore.fetchUsers();
  } else if (consumerType.value === 'group' && groupsStore.groups.length === 0) {
    groupsStore.fetchGroups();
  }
}

// Available items for multi-select
const availableItems = computed(() => {
  if (consumerType.value === 'user') {
    // Exclude users already in this pool
    const existingUsers = new Set(
      props.pool.consumers
        .filter((c) => c.type === 'user' && c.user)
        .map((c) => c.user),
    );
    return usersStore.users
      .filter((u) => !existingUsers.has(u.username))
      .map((u) => u.username);
  } else if (consumerType.value === 'group') {
    // Exclude groups already in this pool
    const existingGroups = new Set(
      props.pool.consumers
        .filter((c) => c.type === 'group' && c.group)
        .map((c) => c.group),
    );
    return groupsStore.groups
      .filter((g) => !existingGroups.has(g.name))
      .map((g) => g.name);
  }
  return [];
});

// Check if we should use multi-select (user/group) or text field (address/workstation)
const useMultiSelect = computed(() => {
  return consumerType.value === 'user' || consumerType.value === 'group';
});

function addConsumer() {
  if (useMultiSelect.value) {
    // Add multiple consumers from multi-select
    if (selectedConsumers.value.length === 0) return;

    const consumers: IConsumer[] = selectedConsumers.value.map((value) => {
      const consumer: IConsumer = { type: consumerType.value };
      if (consumerType.value === 'user') {
        consumer.user = value;
      } else if (consumerType.value === 'group') {
        consumer.group = value;
      }
      return consumer;
    });

    emit('add-consumer', consumers);
    selectedConsumers.value = [];
  } else {
    // Add single consumer from text field (address/workstation)
    if (!consumerValue.value.trim()) return;

    const consumer: IConsumer = { type: consumerType.value };
    if (consumerType.value === 'address') {
      consumer.address = consumerValue.value.trim();
    } else if (consumerType.value === 'workstation') {
      consumer.workstation = consumerValue.value.trim();
    }

    emit('add-consumer', [consumer]);
    consumerValue.value = '';
  }

  showConsumerDialog.value = false;
}
</script>

<template>
  <v-card class="pool-card" elevation="1">
    <!-- Pool Header -->
    <v-card-title class="pool-card__header" @click="isCollapsed = !isCollapsed">
      <!-- Priority badge -->
      <v-avatar size="28" color="primary" variant="tonal" class="pool-card__priority">
        <span class="text-caption font-weight-bold">{{ poolIndex + 1 }}</span>
      </v-avatar>

      <v-text-field
        v-model="poolName"
        variant="solo"
        density="compact"
        hide-details
        class="pool-card__name-field"
        @click.stop
        @blur="emitUpdate"
        @keyup.enter="emitUpdate"
      />

      <!-- Collapsed summary -->
      <span v-if="isCollapsed" class="pool-card__summary text-caption text-medium-emphasis">
        {{ collapsedSummary }}
      </span>

      <!-- Move up/down buttons -->
      <div class="pool-card__move-buttons" @click.stop>
        <v-btn
          icon="mdi-chevron-up"
          size="x-small"
          variant="text"
          :disabled="isFirst"
          @click="emit('move-up')"
        />
        <v-btn
          icon="mdi-chevron-down"
          size="x-small"
          variant="text"
          :disabled="isLast"
          @click="emit('move-down')"
        />
      </div>

      <!-- Collapse toggle -->
      <v-btn
        :icon="isCollapsed ? 'mdi-chevron-down' : 'mdi-chevron-up'"
        size="x-small"
        variant="text"
        class="pool-card__collapse-btn"
        @click.stop="isCollapsed = !isCollapsed"
      />
    </v-card-title>

    <!-- Collapsible content -->
    <div v-show="!isCollapsed" class="pool-card__collapsible">
      <v-card-text class="pool-card__content">
        <!-- Bandwidth Limit Toggle -->
        <div class="pool-card__limit-row">
          <div class="pool-card__limit-label">
            <v-switch
              v-model="bandwidthEnabled"
              color="success"
              label="Limit bandwidth"
              hide-details
              density="compact"
              @update:model-value="emitUpdate"
            />
          </div>
          <div v-if="bandwidthEnabled" class="pool-card__limit-input">
            <v-text-field
              v-model.number="bandwidthLimitMiB"
              type="number"
              suffix="MiB/s"
              variant="outlined"
              density="compact"
              hide-details
              min="1"
              @blur="emitUpdate"
              @keyup.enter="emitUpdate"
            />
          </div>
        </div>

        <!-- Usage Display -->
        <div v-if="usage !== undefined && bandwidthEnabled" class="pool-card__usage">
          <div class="pool-card__usage-text">
            <span class="text-caption">Usage: </span>
            <span class="font-weight-bold">{{ usageMiB.toFixed(1) }} MiB/s</span>
            <span v-if="pool.bandwidthLimit" class="text-caption text-medium-emphasis">
              / {{ (pool.bandwidthLimit / 1048576).toFixed(0) }} MiB/s
            </span>
          </div>
          <v-progress-linear
            v-if="pool.bandwidthLimit"
            :model-value="usagePercent"
            :color="usagePercent > 90 ? 'error' : usagePercent > 70 ? 'warning' : 'success'"
            height="6"
            rounded
            class="mt-1"
          />
        </div>

        <!-- Consumers -->
        <div class="pool-card__consumers">
          <div class="pool-card__consumers-label">
            <span class="text-caption text-medium-emphasis">Consumers</span>
          </div>
          <div class="pool-card__consumers-chips">
            <v-chip
              v-for="(consumer, idx) in pool.consumers"
              :key="`${consumer.type}-${idx}`"
              size="small"
              closable
              @click:close="emit('remove-consumer', idx)"
            >
              <v-icon :icon="getConsumerIcon(consumer.type)" start size="small" />
              {{ getConsumerLabel(consumer) }}
            </v-chip>
            <v-btn
              variant="outlined"
              size="small"
              prepend-icon="mdi-plus"
              @click="openConsumerDialog"
            >
              Add consumer
            </v-btn>
          </div>
        </div>
      </v-card-text>

      <!-- Pool Actions -->
      <v-card-actions class="pool-card__actions">
        <v-btn size="small" variant="text" color="secondary" @click="emit('add-above')">
          Add pool above
        </v-btn>
        <v-btn size="small" variant="text" color="secondary" @click="emit('add-below')">
          Add pool below
        </v-btn>
        <v-spacer />
        <v-btn
          size="small"
          variant="text"
          color="error"
          prepend-icon="mdi-delete"
          @click="emit('delete')"
        >
          Delete pool
        </v-btn>
      </v-card-actions>
    </div>

    <!-- Add Consumer Dialog -->
    <v-dialog v-model="showConsumerDialog" max-width="600">
      <v-card>
        <v-card-title>Add Consumer</v-card-title>
        <v-card-text>
          <v-select
            v-model="consumerType"
            :items="[
              { title: 'User', value: 'user' },
              { title: 'Group', value: 'group' },
              { title: 'IP Address/Range', value: 'address' },
              { title: 'Workstation', value: 'workstation' },
            ]"
            label="Consumer Type"
            variant="outlined"
            class="mb-4"
            @update:model-value="
              () => {
                selectedConsumers = [];
                consumerValue = '';
              }
            "
          />

          <!-- Multi-select for Users/Groups -->
          <v-autocomplete
            v-if="useMultiSelect"
            v-model="selectedConsumers"
            :items="availableItems"
            :label="consumerType === 'user' ? 'Select Users' : 'Select Groups'"
            :loading="
              (consumerType === 'user' && usersStore.isLoading) ||
              (consumerType === 'group' && groupsStore.isLoading)
            "
            :no-data-text="`No ${consumerType}s available`"
            variant="outlined"
            multiple
            chips
            closable-chips
            clearable
          >
            <template #prepend-inner>
              <v-icon>{{ consumerType === 'user' ? 'mdi-account' : 'mdi-account-group' }}</v-icon>
            </template>
          </v-autocomplete>

          <!-- Text field for Address/Workstation -->
          <v-text-field
            v-else
            v-model="consumerValue"
            :label="
              consumerType === 'address'
                ? 'IP Address or CIDR (e.g., 192.168.1.0/24)'
                : 'Workstation Name'
            "
            variant="outlined"
            @keyup.enter="addConsumer"
          >
            <template #prepend-inner>
              <v-icon>{{ consumerType === 'address' ? 'mdi-ip-network' : 'mdi-desktop-classic' }}</v-icon>
            </template>
          </v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showConsumerDialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :disabled="
              useMultiSelect ? selectedConsumers.length === 0 : !consumerValue.trim()
            "
            @click="addConsumer"
          >
            Add {{ useMultiSelect && selectedConsumers.length > 1 ? `(${selectedConsumers.length})` : '' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<style scoped lang="scss">
.pool-card {
  background-color: #22252d !important;
  border: 1px solid rgba(55, 65, 81, 0.3);
  margin-bottom: 16px;

  &__header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(55, 65, 81, 0.3);
    cursor: pointer;
    user-select: none;
  }

  &__priority {
    flex-shrink: 0;
  }

  &__name-field {
    flex: 1;
    min-width: 120px;
    :deep(.v-field) {
      background-color: #1a1d23;
    }
  }

  &__summary {
    flex-shrink: 0;
    white-space: nowrap;
  }

  &__move-buttons {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    margin: -4px 0;
  }

  &__collapse-btn {
    flex-shrink: 0;
    opacity: 0.6;
    transition: opacity 150ms ease;

    &:hover {
      opacity: 1;
    }
  }

  &__collapsible {
    // Smooth content appearance
  }

  &__content {
    padding: 16px;
  }

  &__limit-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  &__limit-label {
    flex: 0 0 auto;
  }

  &__limit-input {
    width: 180px;
  }

  &__usage {
    margin-bottom: 16px;
    padding: 12px;
    background-color: rgba(55, 65, 81, 0.2);
    border-radius: 4px;
  }

  &__usage-text {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }

  &__consumers {
    margin-top: 16px;
  }

  &__consumers-label {
    margin-bottom: 8px;
  }

  &__consumers-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__actions {
    padding: 8px 16px;
    border-top: 1px solid rgba(55, 65, 81, 0.3);
  }
}
</style>
