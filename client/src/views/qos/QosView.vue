<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useQosStore } from '@/stores/qos.store';
import { useNotification } from '@/composables/useNotification';
import BandwidthPoolCard from './components/BandwidthPoolCard.vue';
import type { IPool, IConsumer } from '@shared/types';

const qosStore = useQosStore();
const { success: showSuccess, error: showError } = useNotification();

// Local state
const isTogglingQos = ref(false);
const othersBandwidthEnabled = ref(false);
const othersBandwidthLimitMiB = ref(100);
const usagePollingInterval = ref<number | null>(null);

// Computed
const pools = computed(() => qosStore.primaryConfig?.pools ?? []);
const qosEnabled = computed(() => qosStore.qosEnabled);

// Initialize
onMounted(async () => {
  try {
    await qosStore.fetchQosConfig();

    // Set up others bandwidth limit
    if (qosStore.primaryConfig?.othersBandwidthLimit) {
      othersBandwidthEnabled.value = true;
      othersBandwidthLimitMiB.value = Math.round(
        qosStore.primaryConfig.othersBandwidthLimit / 1048576,
      );
    }

    // Start polling usage if QoS is enabled
    if (qosStore.qosEnabled) {
      startUsagePolling();
    }
  } catch (err) {
    showError('Failed to load QoS configuration');
  }
});

onUnmounted(() => {
  stopUsagePolling();
});

// QoS toggle
async function handleQosToggle(enabled: boolean | null) {
  if (enabled === null) return;

  isTogglingQos.value = true;
  try {
    await qosStore.toggleQos(enabled);
    showSuccess(enabled ? 'QoS enabled successfully' : 'QoS disabled successfully');

    if (enabled) {
      startUsagePolling();
    } else {
      stopUsagePolling();
    }
  } catch (err) {
    showError('Failed to toggle QoS');
  } finally {
    isTogglingQos.value = false;
  }
}

// Pool management
async function addPool(position?: 'above' | 'below', index?: number) {
  const newPool: IPool = {
    name: 'New Pool',
    bandwidthLimit: 524288000, // 500 MiB/s
    consumers: [],
  };

  try {
    if (position === 'above' && index !== undefined) {
      const updatedPools = [...pools.value];
      updatedPools.splice(index, 0, newPool);
      await qosStore.reorderPools(updatedPools);
    } else if (position === 'below' && index !== undefined) {
      const updatedPools = [...pools.value];
      updatedPools.splice(index + 1, 0, newPool);
      await qosStore.reorderPools(updatedPools);
    } else {
      await qosStore.addPool(newPool);
    }
    showSuccess('Pool added successfully');
  } catch (err) {
    showError('Failed to add pool');
  }
}

async function updatePool(index: number, pool: IPool) {
  try {
    await qosStore.updatePool(index, pool);
  } catch (err) {
    showError('Failed to update pool');
  }
}

async function deletePool(index: number) {
  try {
    await qosStore.deletePool(index);
    showSuccess('Pool deleted successfully');
  } catch (err) {
    showError('Failed to delete pool');
  }
}

async function addConsumer(poolIndex: number, consumers: IConsumer[]) {
  try {
    await qosStore.addConsumers(poolIndex, consumers);
    const message = consumers.length === 1
      ? 'Consumer added successfully'
      : `${consumers.length} consumers added successfully`;
    showSuccess(message);
  } catch (err) {
    showError('Failed to add consumer');
  }
}

async function removeConsumer(poolIndex: number, consumerIndex: number) {
  try {
    await qosStore.removeConsumer(poolIndex, consumerIndex);
    showSuccess('Consumer removed successfully');
  } catch (err) {
    showError('Failed to remove consumer');
  }
}

// Others bandwidth limit
async function updateOthersBandwidth() {
  try {
    const limit = othersBandwidthEnabled.value ? othersBandwidthLimitMiB.value * 1048576 : null;
    await qosStore.updateOthersBandwidthLimit(limit);
  } catch (err) {
    showError('Failed to update bandwidth limit');
  }
}

// Usage polling
function startUsagePolling() {
  if (usagePollingInterval.value) return;

  // Initial fetch
  qosStore.fetchQosUsage();

  // Poll every 5 seconds
  usagePollingInterval.value = window.setInterval(() => {
    qosStore.fetchQosUsage();
  }, 5000);
}

function stopUsagePolling() {
  if (usagePollingInterval.value) {
    clearInterval(usagePollingInterval.value);
    usagePollingInterval.value = null;
  }
}

function getPoolUsage(poolName: string): number {
  return qosStore.getPoolUsage(poolName);
}

// Move pool up or down by swapping with neighbor
async function movePool(index: number, direction: 'up' | 'down') {
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= pools.value.length) return;

  try {
    const updatedPools = [...pools.value];
    const temp = updatedPools[index];
    updatedPools[index] = updatedPools[targetIndex];
    updatedPools[targetIndex] = temp;
    await qosStore.reorderPools(updatedPools);
    showSuccess('Pool order updated');
  } catch (err) {
    showError('Failed to reorder pools');
  }
}
</script>

<template>
  <div class="qos-view">
    <div class="qos-view__header">
      <div>
        <h2 class="qos-view__title">Quality of Service</h2>
        <p class="qos-view__subtitle">Configure bandwidth allocation and priorities</p>
      </div>
      <div class="qos-view__actions">
        <v-btn
          color="primary"
          variant="outlined"
          prepend-icon="mdi-plus"
          :disabled="!qosEnabled || qosStore.isSaving"
          @click="addPool()"
        >
          Add Bandwidth Pool
        </v-btn>
      </div>
    </div>

    <!-- Loading -->
    <v-progress-linear v-if="qosStore.isLoading" indeterminate color="primary" class="mb-4" />

    <!-- Enable QoS toggle -->
    <v-card class="qos-view__toggle-card mb-6">
      <v-card-text class="d-flex align-center justify-space-between">
        <div>
          <div class="text-subtitle-1 font-weight-medium">Enable QoS</div>
          <div class="text-caption text-medium-emphasis">
            Enable Quality of Service to manage bandwidth allocation across pools
          </div>
        </div>
        <v-switch
          :model-value="qosEnabled"
          color="primary"
          hide-details
          inset
          :loading="isTogglingQos"
          :disabled="qosStore.isLoading"
          @update:model-value="handleQosToggle"
        />
      </v-card-text>
    </v-card>

    <!-- QoS disabled state -->
    <v-card v-if="!qosEnabled" class="qos-view__placeholder">
      <v-card-text class="text-center pa-12">
        <v-icon size="64" color="secondary" class="mb-4">mdi-speedometer-slow</v-icon>
        <h3 class="text-h6 mb-2">QoS is Disabled</h3>
        <p class="text-medium-emphasis">
          Enable Quality of Service to configure bandwidth pools and priorities.
        </p>
      </v-card-text>
    </v-card>

    <!-- QoS enabled - show pools -->
    <div v-else>
      <!-- Pool order info -->
      <v-alert type="info" variant="tonal" density="compact" class="mb-4" icon="mdi-information">
        Pools are prioritized from top to bottom. Clients are assigned to the first matching pool.
      </v-alert>

      <!-- Bandwidth pools -->
      <div v-if="pools.length > 0" class="qos-view__pools">
        <BandwidthPoolCard
          v-for="(pool, index) in pools"
          :key="`pool-${index}`"
          :pool="pool"
          :pool-index="index"
          :is-first="index === 0"
          :is-last="index === pools.length - 1"
          :usage="getPoolUsage(pool.name)"
          @update="(updatedPool) => updatePool(index, updatedPool)"
          @delete="deletePool(index)"
          @add-above="addPool('above', index)"
          @add-below="addPool('below', index)"
          @move-up="movePool(index, 'up')"
          @move-down="movePool(index, 'down')"
          @remove-consumer="(consumerIndex) => removeConsumer(index, consumerIndex)"
          @add-consumer="(consumers) => addConsumer(index, consumers)"
        />
      </div>

      <!-- No pools message -->
      <v-card v-else class="qos-view__placeholder mb-6">
        <v-card-text class="text-center pa-12">
          <v-icon size="64" color="primary" class="mb-4">mdi-speedometer</v-icon>
          <h3 class="text-h6 mb-2">No Bandwidth Pools</h3>
          <p class="text-medium-emphasis mb-4">
            Add a pool to start managing bandwidth allocation.
          </p>
          <v-btn color="primary" prepend-icon="mdi-plus" @click="addPool()">
            Add Bandwidth Pool
          </v-btn>
        </v-card-text>
      </v-card>

      <!-- All other clients -->
      <v-card class="qos-view__others-card">
        <v-card-title class="qos-view__others-title">
          <v-icon start>mdi-account-multiple-outline</v-icon>
          All Other Clients
        </v-card-title>
        <v-card-text>
          <div class="qos-view__others-content">
            <div class="qos-view__limit-row">
              <div class="qos-view__limit-label">
                <v-switch
                  v-model="othersBandwidthEnabled"
                  color="success"
                  label="Limit bandwidth"
                  hide-details
                  density="compact"
                  @update:model-value="updateOthersBandwidth"
                />
              </div>
              <div v-if="othersBandwidthEnabled" class="qos-view__limit-input">
                <v-text-field
                  v-model.number="othersBandwidthLimitMiB"
                  type="number"
                  suffix="MiB/s"
                  variant="outlined"
                  density="compact"
                  hide-details
                  min="1"
                  @blur="updateOthersBandwidth"
                  @keyup.enter="updateOthersBandwidth"
                />
              </div>
            </div>
            <p class="text-caption text-medium-emphasis mt-2">
              Clients not matching any pool above will be limited by this bandwidth setting.
            </p>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <!-- Saving overlay -->
    <v-overlay :model-value="qosStore.isSaving" contained class="align-center justify-center">
      <v-progress-circular indeterminate size="64" color="primary" />
    </v-overlay>
  </div>
</template>

<style scoped lang="scss">
.qos-view {
  max-width: 1000px;
  position: relative;

  @include phone {
    max-width: 100%;
  }

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 24px;
    gap: 12px;

    @include phone {
      flex-direction: column;
      margin-bottom: 16px;
    }
  }

  &__title {
    font-size: 22px;
    font-weight: 600;
    color: #e5e7eb;
    margin: 0;

    @include phone {
      font-size: 18px;
    }
  }

  &__subtitle {
    font-size: 13px;
    color: #6b7280;
    margin: 4px 0 0;
  }

  &__actions {
    display: flex;
    gap: 8px;

    @include phone {
      flex-wrap: wrap;
    }
  }

  &__toggle-card {
    background-color: #22252d !important;
    border: 1px solid rgba(55, 65, 81, 0.3);
  }

  &__placeholder {
    background-color: #22252d !important;
    border: 1px solid rgba(55, 65, 81, 0.3);
  }

  &__pools {
    margin-bottom: 24px;
  }

  &__others-card {
    background-color: #22252d !important;
    border: 1px solid rgba(55, 65, 81, 0.3);
  }

  &__others-title {
    border-bottom: 1px solid rgba(55, 65, 81, 0.3);
  }

  &__others-content {
    padding-top: 8px;
  }

  &__limit-row {
    display: flex;
    align-items: center;
    justify-content: space-between;

    @include phone {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }
  }

  &__limit-label {
    flex: 0 0 auto;
  }

  &__limit-input {
    width: 180px;

    @include phone {
      width: 100%;
    }
  }
}
</style>
