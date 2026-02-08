<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { IFileAcl, IEfsAclEntry, ISetAclRequest } from '@shared/types';

interface Props {
  modelValue: boolean;
  acl: IFileAcl | null;
  path: string;
  isSaving?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isSaving: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [request: ISetAclRequest];
}>();

// Local copy of ACL entries for editing
const editEntries = ref<IEfsAclEntry[]>([]);
const editOwner = ref('');
const editGroup = ref('');
const recursive = ref(false);

// New entry form
const newEntryType = ref<'user' | 'group'>('user');
const newEntryQualifier = ref('');
const newEntryRead = ref(true);
const newEntryWrite = ref(false);
const newEntryExecute = ref(false);
const newEntryAdmin = ref(false);
const newEntryIsDefault = ref(false);

// Populate from props when dialog opens
watch(
  () => props.modelValue,
  (open) => {
    if (open && props.acl) {
      editEntries.value = props.acl.entries.map((e) => ({ ...e }));
      editOwner.value = props.acl.owner;
      editGroup.value = props.acl.group;
      recursive.value = false;
    }
  },
);

const accessEntries = computed(() =>
  editEntries.value.filter((e) => !e.isDefault),
);

const defaultEntries = computed(() =>
  editEntries.value.filter((e) => e.isDefault),
);

function addEntry(): void {
  if (!newEntryQualifier.value) return;
  editEntries.value.push({
    type: newEntryType.value,
    qualifier: newEntryQualifier.value,
    read: newEntryRead.value,
    write: newEntryWrite.value,
    execute: newEntryExecute.value,
    admin: newEntryAdmin.value,
    isDefault: newEntryIsDefault.value,
  });
  // Reset
  newEntryQualifier.value = '';
  newEntryRead.value = true;
  newEntryWrite.value = false;
  newEntryExecute.value = false;
  newEntryAdmin.value = false;
}

function removeEntry(index: number): void {
  // Find the global index from the original array
  const entry = [...accessEntries.value, ...defaultEntries.value][index];
  const globalIndex = editEntries.value.indexOf(entry);
  if (globalIndex >= 0) {
    editEntries.value.splice(globalIndex, 1);
  }
}

function togglePerm(entry: IEfsAclEntry, perm: 'read' | 'write' | 'execute' | 'admin'): void {
  entry[perm] = !entry[perm];
}

function handleSave(): void {
  const request: ISetAclRequest = {
    entries: editEntries.value,
    owner: editOwner.value || undefined,
    group: editGroup.value || undefined,
    recursive: recursive.value,
  };
  emit('save', request);
}

function handleClose(): void {
  emit('update:modelValue', false);
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="700"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title>
        <v-icon class="mr-2">mdi-shield-key</v-icon>
        Edit Access Control
        <span class="text-caption text-medium-emphasis ml-2">{{ path }}</span>
      </v-card-title>

      <v-card-text>
        <!-- Ownership -->
        <div class="d-flex gap-3 mb-4">
          <v-text-field
            v-model="editOwner"
            label="Owner"
            variant="outlined"
            density="compact"
            hide-details
            style="max-width: 200px"
          />
          <v-text-field
            v-model="editGroup"
            label="Group"
            variant="outlined"
            density="compact"
            hide-details
            style="max-width: 200px"
          />
          <v-checkbox
            v-model="recursive"
            label="Recursive"
            density="compact"
            hide-details
          />
        </div>

        <!-- Access ACL entries -->
        <div class="text-subtitle-2 mb-2">Access Entries</div>
        <v-table density="compact" class="mb-4 acl-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Name</th>
              <th class="text-center">R</th>
              <th class="text-center">W</th>
              <th class="text-center">X</th>
              <th class="text-center">A</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(entry, idx) in accessEntries" :key="'a-' + idx">
              <td>
                <v-chip size="x-small" variant="tonal" label>
                  {{ entry.type }}
                </v-chip>
              </td>
              <td>{{ entry.qualifier || '(owner)' }}</td>
              <td class="text-center">
                <v-checkbox-btn
                  :model-value="entry.read"
                  density="compact"
                  @update:model-value="togglePerm(entry, 'read')"
                />
              </td>
              <td class="text-center">
                <v-checkbox-btn
                  :model-value="entry.write"
                  density="compact"
                  @update:model-value="togglePerm(entry, 'write')"
                />
              </td>
              <td class="text-center">
                <v-checkbox-btn
                  :model-value="entry.execute"
                  density="compact"
                  @update:model-value="togglePerm(entry, 'execute')"
                />
              </td>
              <td class="text-center">
                <v-checkbox-btn
                  :model-value="entry.admin"
                  density="compact"
                  @update:model-value="togglePerm(entry, 'admin')"
                />
              </td>
              <td>
                <v-btn
                  icon="mdi-close"
                  size="x-small"
                  variant="text"
                  @click="removeEntry(idx)"
                />
              </td>
            </tr>
          </tbody>
        </v-table>

        <!-- Default ACL entries -->
        <div v-if="defaultEntries.length > 0">
          <div class="text-subtitle-2 mb-2">Default Entries (inherited by new items)</div>
          <v-table density="compact" class="mb-4 acl-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Name</th>
                <th class="text-center">R</th>
                <th class="text-center">W</th>
                <th class="text-center">X</th>
                <th class="text-center">A</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(entry, idx) in defaultEntries" :key="'d-' + idx">
                <td>
                  <v-chip size="x-small" variant="tonal" label>
                    {{ entry.type }}
                  </v-chip>
                </td>
                <td>{{ entry.qualifier || '(owner)' }}</td>
                <td class="text-center">
                  <v-checkbox-btn
                    :model-value="entry.read"
                    density="compact"
                    @update:model-value="togglePerm(entry, 'read')"
                  />
                </td>
                <td class="text-center">
                  <v-checkbox-btn
                    :model-value="entry.write"
                    density="compact"
                    @update:model-value="togglePerm(entry, 'write')"
                  />
                </td>
                <td class="text-center">
                  <v-checkbox-btn
                    :model-value="entry.execute"
                    density="compact"
                    @update:model-value="togglePerm(entry, 'execute')"
                  />
                </td>
                <td class="text-center">
                  <v-checkbox-btn
                    :model-value="entry.admin"
                    density="compact"
                    @update:model-value="togglePerm(entry, 'admin')"
                  />
                </td>
                <td>
                  <v-btn
                    icon="mdi-close"
                    size="x-small"
                    variant="text"
                    @click="removeEntry(accessEntries.length + idx)"
                  />
                </td>
              </tr>
            </tbody>
          </v-table>
        </div>

        <!-- Add new entry -->
        <div class="text-subtitle-2 mb-2">Add Entry</div>
        <div class="d-flex align-center gap-2 flex-wrap">
          <v-select
            v-model="newEntryType"
            :items="[
              { title: 'User', value: 'user' },
              { title: 'Group', value: 'group' },
            ]"
            item-title="title"
            item-value="value"
            variant="outlined"
            density="compact"
            hide-details
            style="max-width: 120px"
          />
          <v-text-field
            v-model="newEntryQualifier"
            :label="newEntryType === 'user' ? 'Username' : 'Group name'"
            variant="outlined"
            density="compact"
            hide-details
            style="max-width: 180px"
          />
          <v-checkbox-btn v-model="newEntryRead" label="R" density="compact" />
          <v-checkbox-btn v-model="newEntryWrite" label="W" density="compact" />
          <v-checkbox-btn v-model="newEntryExecute" label="X" density="compact" />
          <v-checkbox-btn v-model="newEntryAdmin" label="A" density="compact" />
          <v-checkbox v-model="newEntryIsDefault" label="Default" density="compact" hide-details />
          <v-btn
            size="small"
            variant="tonal"
            color="primary"
            icon="mdi-plus"
            :disabled="!newEntryQualifier"
            @click="addEntry"
          />
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn @click="handleClose" :disabled="props.isSaving">Cancel</v-btn>
        <v-btn
          color="primary"
          :loading="props.isSaving"
          @click="handleSave"
        >
          Apply
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.acl-table {
  background: transparent !important;

  :deep(table) {
    background: #22252d;
  }

  :deep(th) {
    font-size: 11px !important;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
}
</style>
