<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useUsersStore } from '@/stores/users.store';
import { useGroupsStore } from '@/stores/groups.store';

const props = defineProps<{
  modelValue: boolean;
  spaceName: string;
  existingUsers: string[];
  existingGroups: string[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'assign', payload: { type: 'user' | 'group'; name: string }): void;
}>();

const usersStore = useUsersStore();
const groupsStore = useGroupsStore();

const assigneeType = ref<'user' | 'group'>('user');
const search = ref('');
const selected = ref<string | null>(null);

// Fetch users and groups when dialog opens
watch(() => props.modelValue, async (open) => {
  if (open) {
    search.value = '';
    selected.value = null;
    assigneeType.value = 'user';
    await Promise.all([
      usersStore.fetchUsers(),
      groupsStore.fetchGroups(),
    ]);
  }
});

const availableUsers = computed(() => {
  const existing = new Set(props.existingUsers);
  let users = (usersStore.users || []).filter((u) => !existing.has(u.username));
  if (search.value) {
    const q = search.value.toLowerCase();
    users = users.filter((u) => u.username.toLowerCase().includes(q));
  }
  return users;
});

const availableGroups = computed(() => {
  const existing = new Set(props.existingGroups);
  let groups = (groupsStore.groups || []).filter((g) => !existing.has(g.name));
  if (search.value) {
    const q = search.value.toLowerCase();
    groups = groups.filter((g) => g.name.toLowerCase().includes(q));
  }
  return groups;
});

function handleAssign(): void {
  if (!selected.value) return;
  emit('assign', { type: assigneeType.value, name: selected.value });
  emit('update:modelValue', false);
}

function close(): void {
  emit('update:modelValue', false);
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="520" @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon>mdi-shield-account</v-icon>
        Add Space Manager
      </v-card-title>

      <v-card-subtitle class="pb-0">
        Assign a user or group as manager of <strong>{{ spaceName }}</strong>
      </v-card-subtitle>

      <v-card-text>
        <!-- Type toggle -->
        <v-btn-toggle
          v-model="assigneeType"
          mandatory
          density="compact"
          variant="outlined"
          color="primary"
          class="mb-4"
        >
          <v-btn value="user" prepend-icon="mdi-account">User</v-btn>
          <v-btn value="group" prepend-icon="mdi-account-group">Group</v-btn>
        </v-btn-toggle>

        <!-- Search -->
        <v-text-field
          v-model="search"
          density="compact"
          variant="outlined"
          :placeholder="`Search ${assigneeType}s...`"
          prepend-inner-icon="mdi-magnify"
          hide-details
          clearable
          class="mb-3"
        />

        <!-- User list -->
        <div v-if="assigneeType === 'user'" class="manager-assign__list">
          <div
            v-for="u in availableUsers"
            :key="u.username"
            class="manager-assign__item"
            :class="{ 'manager-assign__item--selected': selected === u.username }"
            @click="selected = u.username"
          >
            <v-icon size="20" class="mr-2">mdi-account</v-icon>
            <span>{{ u.username }}</span>
            <v-chip v-if="u.identitySource !== 'LOCAL'" size="x-small" variant="tonal" class="ml-2">
              {{ u.identitySource }}
            </v-chip>
            <v-spacer />
            <v-icon v-if="selected === u.username" size="20" color="primary">mdi-check-circle</v-icon>
          </div>
          <div v-if="availableUsers.length === 0" class="text-medium-emphasis text-center py-4">
            No available users
          </div>
        </div>

        <!-- Group list -->
        <div v-else class="manager-assign__list">
          <div
            v-for="g in availableGroups"
            :key="g.name"
            class="manager-assign__item"
            :class="{ 'manager-assign__item--selected': selected === g.name }"
            @click="selected = g.name"
          >
            <v-icon size="20" class="mr-2">mdi-account-group</v-icon>
            <span>{{ g.name }}</span>
            <v-spacer />
            <v-icon v-if="selected === g.name" size="20" color="primary">mdi-check-circle</v-icon>
          </div>
          <div v-if="availableGroups.length === 0" class="text-medium-emphasis text-center py-4">
            No available groups
          </div>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          :disabled="!selected"
          @click="handleAssign"
        >
          Assign as Manager
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.manager-assign {
  &__list {
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid rgba(var(--v-border-color), 0.12);
    border-radius: 8px;
  }

  &__item {
    display: flex;
    align-items: center;
    padding: 10px 14px;
    cursor: pointer;
    transition: background-color 150ms ease;
    border-bottom: 1px solid rgba(var(--v-border-color), 0.06);

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background-color: rgba(var(--v-theme-primary), 0.04);
    }

    &--selected {
      background-color: rgba(var(--v-theme-primary), 0.08);
    }
  }
}
</style>
