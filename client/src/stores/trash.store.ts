import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/plugins/axios';
import type {
  ITrashEntry,
  ITrashStats,
  ITrashConfig,
  ITrashSchedulerStatus,
  ITrashOperationResult,
} from '@shared/types';

export const useTrashStore = defineStore('trash', () => {
  // ──────────────────────────────────────────────
  // State
  // ──────────────────────────────────────────────

  const entries = ref<ITrashEntry[]>([]);
  const stats = ref<ITrashStats | null>(null);
  const config = ref<ITrashConfig | null>(null);
  const scheduler = ref<ITrashSchedulerStatus | null>(null);

  const isLoading = ref(false);
  const isLoadingStats = ref(false);
  const isRestoring = ref(false);
  const isPurging = ref(false);
  const error = ref<string | null>(null);

  // Filters
  const filterSpace = ref<string>('');

  // ──────────────────────────────────────────────
  // Computed
  // ──────────────────────────────────────────────

  const totalItems = computed(() => stats.value?.totalItems ?? 0);
  const totalSizeBytes = computed(() => stats.value?.totalSizeBytes ?? 0);
  const trashEnabled = computed(() => config.value?.enabled ?? true);

  // ──────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────

  function extractError(err: unknown): string {
    if (err && typeof err === 'object' && 'response' in err) {
      const resp = (err as { response?: { data?: { error?: string } } }).response;
      return resp?.data?.error || 'An error occurred';
    }
    return err instanceof Error ? err.message : 'An error occurred';
  }

  // ──────────────────────────────────────────────
  // Actions
  // ──────────────────────────────────────────────

  async function fetchEntries(spaceName?: string): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const params: Record<string, string> = { status: 'active' };
      if (spaceName) params.space = spaceName;
      const { data } = await api.get('/api/v1/trash', { params });
      entries.value = data.data;
    } catch (err: unknown) {
      error.value = extractError(err);
    } finally {
      isLoading.value = false;
    }
  }

  async function fetchStats(): Promise<void> {
    isLoadingStats.value = true;
    try {
      const { data } = await api.get('/api/v1/trash/stats');
      stats.value = data.data;
    } catch (err: unknown) {
      error.value = extractError(err);
    } finally {
      isLoadingStats.value = false;
    }
  }

  async function fetchConfig(): Promise<void> {
    try {
      const { data } = await api.get('/api/v1/trash/config');
      config.value = data.data.config;
      scheduler.value = data.data.scheduler;
    } catch (err: unknown) {
      error.value = extractError(err);
    }
  }

  async function updateConfig(updates: Partial<ITrashConfig>): Promise<void> {
    try {
      const { data } = await api.put('/api/v1/trash/config', updates);
      config.value = data.data.config;
      scheduler.value = data.data.scheduler;
    } catch (err: unknown) {
      error.value = extractError(err);
    }
  }

  async function restoreEntry(trashId: number): Promise<ITrashOperationResult | null> {
    isRestoring.value = true;
    error.value = null;
    try {
      const { data } = await api.post(`/api/v1/trash/${trashId}/restore`, {
        restoreToOriginal: true,
      });
      // Refresh lists
      await Promise.all([fetchEntries(filterSpace.value || undefined), fetchStats()]);
      return data.data;
    } catch (err: unknown) {
      error.value = extractError(err);
      return null;
    } finally {
      isRestoring.value = false;
    }
  }

  async function purgeEntry(trashId: number): Promise<ITrashOperationResult | null> {
    isPurging.value = true;
    error.value = null;
    try {
      const { data } = await api.delete(`/api/v1/trash/${trashId}`);
      await Promise.all([fetchEntries(filterSpace.value || undefined), fetchStats()]);
      return data.data;
    } catch (err: unknown) {
      error.value = extractError(err);
      return null;
    } finally {
      isPurging.value = false;
    }
  }

  async function purgeAll(spaceName?: string): Promise<ITrashOperationResult | null> {
    isPurging.value = true;
    error.value = null;
    try {
      const params: Record<string, string> = {};
      if (spaceName) params.space = spaceName;
      const { data } = await api.delete('/api/v1/trash', { params });
      await Promise.all([fetchEntries(filterSpace.value || undefined), fetchStats()]);
      return data.data;
    } catch (err: unknown) {
      error.value = extractError(err);
      return null;
    } finally {
      isPurging.value = false;
    }
  }

  async function refresh(): Promise<void> {
    await Promise.all([
      fetchEntries(filterSpace.value || undefined),
      fetchStats(),
      fetchConfig(),
    ]);
  }

  return {
    // State
    entries,
    stats,
    config,
    scheduler,
    isLoading,
    isLoadingStats,
    isRestoring,
    isPurging,
    error,
    filterSpace,

    // Computed
    totalItems,
    totalSizeBytes,
    trashEnabled,

    // Actions
    fetchEntries,
    fetchStats,
    fetchConfig,
    updateConfig,
    restoreEntry,
    purgeEntry,
    purgeAll,
    refresh,
  };
});
