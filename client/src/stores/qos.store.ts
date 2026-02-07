import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/plugins/axios';
import type { IQosConfig, IQosUsage, IPool, IConsumer } from '@shared/types';

export const useQosStore = defineStore('qos', () => {

  // State
  const configs = ref<IQosConfig[]>([]);
  const usage = ref<IQosUsage[]>([]);
  const isLoading = ref(false);
  const isSaving = ref(false);
  const error = ref<string | null>(null);

  // Computed - get primary storage node group config (usually the first one)
  const primaryConfig = computed<IQosConfig | null>(() => {
    return configs.value.length > 0 ? configs.value[0] : null;
  });

  // Computed - check if QoS is enabled for primary config
  const qosEnabled = computed<boolean>(() => {
    return primaryConfig.value?.qosEnabled ?? false;
  });

  /**
   * Fetch QoS configuration for all storage node groups
   */
  async function fetchQosConfig(): Promise<void> {
    isLoading.value = true;
    error.value = null;

    try {
      const response = await api.get<{ data: IQosConfig[] }>('/api/v1/qos/config');
      configs.value = response.data.data;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch QoS configuration';
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Update QoS configuration for a specific storage node group
   */
  async function updateQosConfig(
    storageNodeGroup: string,
    config: Omit<IQosConfig, 'storageNodeGroup'>,
  ): Promise<void> {
    isSaving.value = true;
    error.value = null;

    try {
      await api.put(`/api/v1/qos/config/${encodeURIComponent(storageNodeGroup)}`, config);
      // Refresh config after update
      await fetchQosConfig();
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to update QoS configuration';
      throw err;
    } finally {
      isSaving.value = false;
    }
  }

  /**
   * Fetch real-time bandwidth usage for all storage node groups
   */
  async function fetchQosUsage(): Promise<void> {
    try {
      const response = await api.get<{ data: IQosUsage[] }>('/api/v1/qos/usage');
      usage.value = response.data.data;
    } catch (err) {
      console.error('Failed to fetch QoS usage:', err);
      // Don't throw - usage polling should be non-blocking
    }
  }

  /**
   * Toggle QoS enabled state for primary config
   */
  async function toggleQos(enabled: boolean): Promise<void> {
    if (!primaryConfig.value) {
      throw new Error('No QoS configuration available');
    }

    await updateQosConfig(primaryConfig.value.storageNodeGroup, {
      qosEnabled: enabled,
      pools: primaryConfig.value.pools,
      othersBandwidthLimit: primaryConfig.value.othersBandwidthLimit,
    });
  }

  /**
   * Add a new bandwidth pool
   */
  async function addPool(pool: IPool): Promise<void> {
    if (!primaryConfig.value) {
      throw new Error('No QoS configuration available');
    }

    const updatedPools = [...primaryConfig.value.pools, pool];

    await updateQosConfig(primaryConfig.value.storageNodeGroup, {
      qosEnabled: primaryConfig.value.qosEnabled,
      pools: updatedPools,
      othersBandwidthLimit: primaryConfig.value.othersBandwidthLimit,
    });
  }

  /**
   * Update an existing pool
   */
  async function updatePool(index: number, pool: IPool): Promise<void> {
    if (!primaryConfig.value) {
      throw new Error('No QoS configuration available');
    }

    const updatedPools = [...primaryConfig.value.pools];
    updatedPools[index] = pool;

    await updateQosConfig(primaryConfig.value.storageNodeGroup, {
      qosEnabled: primaryConfig.value.qosEnabled,
      pools: updatedPools,
      othersBandwidthLimit: primaryConfig.value.othersBandwidthLimit,
    });
  }

  /**
   * Delete a pool by index
   */
  async function deletePool(index: number): Promise<void> {
    if (!primaryConfig.value) {
      throw new Error('No QoS configuration available');
    }

    const updatedPools = primaryConfig.value.pools.filter((_, i) => i !== index);

    await updateQosConfig(primaryConfig.value.storageNodeGroup, {
      qosEnabled: primaryConfig.value.qosEnabled,
      pools: updatedPools,
      othersBandwidthLimit: primaryConfig.value.othersBandwidthLimit,
    });
  }

  /**
   * Reorder pools (drag and drop)
   */
  async function reorderPools(newOrder: IPool[]): Promise<void> {
    if (!primaryConfig.value) {
      throw new Error('No QoS configuration available');
    }

    await updateQosConfig(primaryConfig.value.storageNodeGroup, {
      qosEnabled: primaryConfig.value.qosEnabled,
      pools: newOrder,
      othersBandwidthLimit: primaryConfig.value.othersBandwidthLimit,
    });
  }

  /**
   * Add a consumer to a pool
   */
  async function addConsumer(poolIndex: number, consumer: IConsumer): Promise<void> {
    if (!primaryConfig.value) {
      throw new Error('No QoS configuration available');
    }

    const updatedPools = [...primaryConfig.value.pools];
    const pool = { ...updatedPools[poolIndex] };
    pool.consumers = [...pool.consumers, consumer];
    updatedPools[poolIndex] = pool;

    await updateQosConfig(primaryConfig.value.storageNodeGroup, {
      qosEnabled: primaryConfig.value.qosEnabled,
      pools: updatedPools,
      othersBandwidthLimit: primaryConfig.value.othersBandwidthLimit,
    });
  }

  /**
   * Add multiple consumers to a pool at once
   */
  async function addConsumers(poolIndex: number, consumers: IConsumer[]): Promise<void> {
    if (!primaryConfig.value) {
      throw new Error('No QoS configuration available');
    }

    const updatedPools = [...primaryConfig.value.pools];
    const pool = { ...updatedPools[poolIndex] };
    pool.consumers = [...pool.consumers, ...consumers];
    updatedPools[poolIndex] = pool;

    await updateQosConfig(primaryConfig.value.storageNodeGroup, {
      qosEnabled: primaryConfig.value.qosEnabled,
      pools: updatedPools,
      othersBandwidthLimit: primaryConfig.value.othersBandwidthLimit,
    });
  }

  /**
   * Remove a consumer from a pool
   */
  async function removeConsumer(poolIndex: number, consumerIndex: number): Promise<void> {
    if (!primaryConfig.value) {
      throw new Error('No QoS configuration available');
    }

    const updatedPools = [...primaryConfig.value.pools];
    const pool = { ...updatedPools[poolIndex] };
    pool.consumers = pool.consumers.filter((_, i) => i !== consumerIndex);
    updatedPools[poolIndex] = pool;

    await updateQosConfig(primaryConfig.value.storageNodeGroup, {
      qosEnabled: primaryConfig.value.qosEnabled,
      pools: updatedPools,
      othersBandwidthLimit: primaryConfig.value.othersBandwidthLimit,
    });
  }

  /**
   * Update "others" bandwidth limit
   */
  async function updateOthersBandwidthLimit(limit: number | null): Promise<void> {
    if (!primaryConfig.value) {
      throw new Error('No QoS configuration available');
    }

    await updateQosConfig(primaryConfig.value.storageNodeGroup, {
      qosEnabled: primaryConfig.value.qosEnabled,
      pools: primaryConfig.value.pools,
      othersBandwidthLimit: limit,
    });
  }

  /**
   * Get bandwidth usage for a specific pool
   */
  function getPoolUsage(poolName: string): number {
    if (!usage.value.length) return 0;

    const nodeGroupUsage = usage.value[0]; // Primary storage node group
    const poolUsage = nodeGroupUsage.pools.find((p) => p.poolName === poolName);
    return poolUsage?.bytesPerSecond ?? 0;
  }

  return {
    // State
    configs,
    usage,
    isLoading,
    isSaving,
    error,

    // Computed
    primaryConfig,
    qosEnabled,

    // Actions
    fetchQosConfig,
    updateQosConfig,
    fetchQosUsage,
    toggleQos,
    addPool,
    updatePool,
    deletePool,
    reorderPools,
    addConsumer,
    addConsumers,
    removeConsumer,
    updateOthersBandwidthLimit,
    getPoolUsage,
  };
});
