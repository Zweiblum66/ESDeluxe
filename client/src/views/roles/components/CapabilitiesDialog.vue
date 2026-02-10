<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRolesStore } from '@/stores/roles.store';
import type { ISpaceManagerCapabilities } from '@shared/types';

const props = defineProps<{
  modelValue: boolean;
  spaceName: string;
  username: string;
  capabilities: ISpaceManagerCapabilities;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'saved'): void;
}>();

const rolesStore = useRolesStore();

// Local form state
const canManageUsers = ref(true);
const canManageGroups = ref(true);
const canManageQuota = ref(true);
const hasMaxQuota = ref(false);
const maxQuotaValue = ref<number>(0);
const maxQuotaUnit = ref<'GB' | 'TB'>('TB');
const isSaving = ref(false);

// Initialize form when dialog opens
watch(() => props.modelValue, (open) => {
  if (open) {
    canManageUsers.value = props.capabilities.canManageUsers;
    canManageGroups.value = props.capabilities.canManageGroups;
    canManageQuota.value = props.capabilities.canManageQuota;

    if (props.capabilities.maxQuotaBytes != null && props.capabilities.maxQuotaBytes > 0) {
      hasMaxQuota.value = true;
      // Convert bytes to best unit
      const gb = props.capabilities.maxQuotaBytes / (1024 * 1024 * 1024);
      if (gb >= 1024 && gb % 1024 === 0) {
        maxQuotaValue.value = gb / 1024;
        maxQuotaUnit.value = 'TB';
      } else {
        maxQuotaValue.value = Math.round(gb);
        maxQuotaUnit.value = 'GB';
      }
    } else {
      hasMaxQuota.value = false;
      maxQuotaValue.value = 1;
      maxQuotaUnit.value = 'TB';
    }
  }
});

function computeMaxQuotaBytes(): number | null {
  if (!canManageQuota.value || !hasMaxQuota.value) return null;
  const multiplier = maxQuotaUnit.value === 'TB'
    ? 1024 * 1024 * 1024 * 1024
    : 1024 * 1024 * 1024;
  return maxQuotaValue.value * multiplier;
}

async function handleSave(): Promise<void> {
  isSaving.value = true;
  try {
    const success = await rolesStore.updateCapabilities(
      props.spaceName,
      props.username,
      {
        canManageUsers: canManageUsers.value,
        canManageGroups: canManageGroups.value,
        canManageQuota: canManageQuota.value,
        maxQuotaBytes: computeMaxQuotaBytes(),
      },
    );
    if (success) {
      emit('saved');
      emit('update:modelValue', false);
    }
  } finally {
    isSaving.value = false;
  }
}

function close(): void {
  emit('update:modelValue', false);
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="480" @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon>mdi-shield-lock-outline</v-icon>
        Capabilities
      </v-card-title>

      <v-card-subtitle class="pb-0">
        Configure what <strong>{{ username }}</strong> can do on <strong>{{ spaceName }}</strong>
      </v-card-subtitle>

      <v-card-text class="pt-4">
        <!-- Manage Users -->
        <div class="caps-row">
          <div class="caps-row__info">
            <div class="text-body-2 font-weight-medium">Manage Users</div>
            <div class="text-caption text-medium-emphasis">Add/remove users and change access types</div>
          </div>
          <v-switch
            v-model="canManageUsers"
            hide-details
            density="compact"
            color="primary"
          />
        </div>

        <v-divider class="my-2" />

        <!-- Manage Groups -->
        <div class="caps-row">
          <div class="caps-row__info">
            <div class="text-body-2 font-weight-medium">Manage Groups</div>
            <div class="text-caption text-medium-emphasis">Add/remove groups and change group access</div>
          </div>
          <v-switch
            v-model="canManageGroups"
            hide-details
            density="compact"
            color="primary"
          />
        </div>

        <v-divider class="my-2" />

        <!-- Manage Quota -->
        <div class="caps-row">
          <div class="caps-row__info">
            <div class="text-body-2 font-weight-medium">Change Quota</div>
            <div class="text-caption text-medium-emphasis">Modify space quota allocation</div>
          </div>
          <v-switch
            v-model="canManageQuota"
            hide-details
            density="compact"
            color="primary"
          />
        </div>

        <!-- Max Quota Limit (shown when quota capability is enabled) -->
        <div v-if="canManageQuota" class="ml-4 mt-3">
          <v-checkbox
            v-model="hasMaxQuota"
            label="Set maximum quota limit"
            hide-details
            density="compact"
            color="primary"
          />
          <div v-if="hasMaxQuota" class="d-flex align-center ga-2 mt-2">
            <v-text-field
              v-model.number="maxQuotaValue"
              type="number"
              :min="1"
              density="compact"
              variant="outlined"
              hide-details
              style="max-width: 120px;"
              label="Max quota"
            />
            <v-btn-toggle
              v-model="maxQuotaUnit"
              mandatory
              density="compact"
              variant="outlined"
              color="primary"
            >
              <v-btn value="GB">GB</v-btn>
              <v-btn value="TB">TB</v-btn>
            </v-btn-toggle>
          </div>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn @click="close" :disabled="isSaving">Cancel</v-btn>
        <v-btn
          color="primary"
          :loading="isSaving"
          @click="handleSave"
        >
          Save
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.caps-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;

  &__info {
    flex: 1;
    min-width: 0;
  }
}
</style>
