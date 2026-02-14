import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/plugins/axios';
import type {
  IAsset,
  IAssetCatalogResult,
  IAssetCatalogStats,
  IAssetCatalogQuery,
  IAssetScanLog,
  IAssetScanConfig,
  IAssetScanSchedulerStatus,
  ICatalogJobStats,
  AssetType,
  ProxyStatus,
} from '@shared/types';

export const useAssetCatalogStore = defineStore('asset-catalog', () => {
  // ── State ────────────────────────────────────
  const catalogResult = ref<IAssetCatalogResult | null>(null);
  const currentAsset = ref<IAsset | null>(null);
  const stats = ref<IAssetCatalogStats | null>(null);
  const scanLogs = ref<IAssetScanLog[]>([]);
  const scanConfigs = ref<IAssetScanConfig[]>([]);
  const schedulerStatus = ref<IAssetScanSchedulerStatus | null>(null);
  const jobStats = ref<ICatalogJobStats | null>(null);

  const isLoading = ref(false);
  const isAssetLoading = ref(false);
  const isScanning = ref(false);
  const error = ref<string | null>(null);

  // ── Computed ──────────────────────────────────
  const assets = computed(() => catalogResult.value?.assets ?? []);
  const totalAssets = computed(() => catalogResult.value?.total ?? 0);

  // ── Helpers ──────────────────────────────────
  function extractError(err: unknown): string {
    const axiosErr = err as { response?: { data?: { message?: string } } };
    return axiosErr.response?.data?.message ||
      (err instanceof Error ? err.message : 'An error occurred');
  }

  // ── Assets ───────────────────────────────────

  async function fetchAssets(query: IAssetCatalogQuery = {}): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await api.get('/api/v1/catalog/assets', { params: query });
      catalogResult.value = response.data.data;
    } catch (err: unknown) {
      error.value = extractError(err);
    } finally {
      isLoading.value = false;
    }
  }

  async function fetchAsset(id: number): Promise<IAsset | null> {
    isAssetLoading.value = true;
    error.value = null;
    try {
      const response = await api.get(`/api/v1/catalog/assets/${id}`);
      currentAsset.value = response.data.data;
      return currentAsset.value;
    } catch (err: unknown) {
      error.value = extractError(err);
      return null;
    } finally {
      isAssetLoading.value = false;
    }
  }

  async function deleteAsset(id: number): Promise<boolean> {
    error.value = null;
    try {
      await api.delete(`/api/v1/catalog/assets/${id}`);
      // Remove from local list
      if (catalogResult.value) {
        catalogResult.value.assets = catalogResult.value.assets.filter((a) => a.id !== id);
        catalogResult.value.total--;
      }
      return true;
    } catch (err: unknown) {
      error.value = extractError(err);
      return false;
    }
  }

  async function groupFiles(
    spaceName: string,
    filePaths: string[],
    assetName: string,
  ): Promise<IAsset | null> {
    error.value = null;
    try {
      const response = await api.post('/api/v1/catalog/assets/group', {
        spaceName,
        filePaths,
        assetName,
      });
      return response.data.data;
    } catch (err: unknown) {
      error.value = extractError(err);
      return null;
    }
  }

  async function ungroupAsset(id: number): Promise<boolean> {
    error.value = null;
    try {
      await api.post(`/api/v1/catalog/assets/${id}/ungroup`);
      return true;
    } catch (err: unknown) {
      error.value = extractError(err);
      return false;
    }
  }

  // ── Archive Restore ─────────────────────────

  async function restoreAsset(id: number): Promise<{ restored: string[]; failed: { path: string; error: string }[] } | null> {
    error.value = null;
    try {
      const response = await api.post(`/api/v1/catalog/assets/${id}/restore`);
      return response.data.data;
    } catch (err: unknown) {
      error.value = extractError(err);
      return null;
    }
  }

  // ── Scanning ─────────────────────────────────

  async function triggerScan(spaceName: string): Promise<boolean> {
    isScanning.value = true;
    error.value = null;
    try {
      await api.post('/api/v1/catalog/scan', { spaceName });
      return true;
    } catch (err: unknown) {
      error.value = extractError(err);
      return false;
    } finally {
      isScanning.value = false;
    }
  }

  async function fetchScanStatus(): Promise<void> {
    try {
      const response = await api.get('/api/v1/catalog/scan/status');
      schedulerStatus.value = response.data.data;
    } catch (err: unknown) {
      console.error('Failed to fetch scan status:', err);
    }
  }

  async function fetchScanLogs(spaceName?: string): Promise<void> {
    try {
      const params = spaceName ? { spaceName } : {};
      const response = await api.get('/api/v1/catalog/scan/logs', { params });
      scanLogs.value = response.data.data;
    } catch (err: unknown) {
      console.error('Failed to fetch scan logs:', err);
    }
  }

  // ── Scan Config ──────────────────────────────

  async function fetchScanConfigs(): Promise<void> {
    try {
      const response = await api.get('/api/v1/catalog/scan/config');
      scanConfigs.value = response.data.data;
    } catch (err: unknown) {
      console.error('Failed to fetch scan configs:', err);
    }
  }

  async function updateScanConfig(
    spaceName: string,
    enabled: boolean,
    intervalHours: number,
  ): Promise<boolean> {
    error.value = null;
    try {
      await api.put(`/api/v1/catalog/scan/config/${encodeURIComponent(spaceName)}`, {
        enabled,
        intervalHours,
      });
      await fetchScanConfigs();
      return true;
    } catch (err: unknown) {
      error.value = extractError(err);
      return false;
    }
  }

  // ── Job Stats ──────────────────────────────────

  async function fetchJobStats(): Promise<void> {
    try {
      const response = await api.get('/api/v1/catalog/jobs/stats');
      jobStats.value = response.data.data;
    } catch (err: unknown) {
      console.error('Failed to fetch job stats:', err);
    }
  }

  // ── Stats ────────────────────────────────────

  async function fetchStats(): Promise<void> {
    try {
      const response = await api.get('/api/v1/catalog/stats');
      stats.value = response.data.data;
    } catch (err: unknown) {
      console.error('Failed to fetch catalog stats:', err);
    }
  }

  return {
    // State
    catalogResult,
    currentAsset,
    stats,
    scanLogs,
    scanConfigs,
    schedulerStatus,
    jobStats,
    isLoading,
    isAssetLoading,
    isScanning,
    error,
    // Computed
    assets,
    totalAssets,
    // Actions
    fetchAssets,
    fetchAsset,
    deleteAsset,
    groupFiles,
    ungroupAsset,
    restoreAsset,
    triggerScan,
    fetchScanStatus,
    fetchScanLogs,
    fetchScanConfigs,
    updateScanConfig,
    fetchJobStats,
    fetchStats,
  };
});
