import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/plugins/axios';
import type {
  IArchiveLocation,
  IArchiveCatalogEntry,
  IArchiveStats,
  IArchiveCatalogResult,
  ICreateArchiveLocationRequest,
  IUpdateArchiveLocationRequest,
  ArchiveCatalogStatus,
} from '@shared/types';

export const useArchiveStore = defineStore('archive', () => {
  const locations = ref<IArchiveLocation[]>([]);
  const stats = ref<IArchiveStats | null>(null);
  const catalogResult = ref<IArchiveCatalogResult | null>(null);
  const isLoading = ref(false);
  const isCatalogLoading = ref(false);
  const error = ref<string | null>(null);

  function extractError(err: unknown): string {
    const axiosErr = err as { response?: { data?: { message?: string } } };
    return axiosErr.response?.data?.message ||
      (err instanceof Error ? err.message : 'An error occurred');
  }

  // ── Locations ────────────────────────────────

  async function fetchLocations(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await api.get('/api/v1/archive/locations');
      locations.value = response.data.data;
    } catch (err: unknown) {
      error.value = extractError(err);
    } finally {
      isLoading.value = false;
    }
  }

  async function createLocation(request: ICreateArchiveLocationRequest): Promise<boolean> {
    error.value = null;
    try {
      await api.post('/api/v1/archive/locations', request);
      await fetchLocations();
      return true;
    } catch (err: unknown) {
      error.value = extractError(err);
      return false;
    }
  }

  async function updateLocation(id: number, request: IUpdateArchiveLocationRequest): Promise<boolean> {
    error.value = null;
    try {
      await api.put(`/api/v1/archive/locations/${id}`, request);
      await fetchLocations();
      return true;
    } catch (err: unknown) {
      error.value = extractError(err);
      return false;
    }
  }

  async function deleteLocation(id: number): Promise<boolean> {
    error.value = null;
    try {
      await api.delete(`/api/v1/archive/locations/${id}`);
      await fetchLocations();
      return true;
    } catch (err: unknown) {
      error.value = extractError(err);
      return false;
    }
  }

  async function testLocation(id: number): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await api.post(`/api/v1/archive/locations/${id}/test`);
      return response.data.data;
    } catch (err: unknown) {
      return { ok: false, message: extractError(err) };
    }
  }

  // ── Stats ────────────────────────────────────

  async function fetchStats(): Promise<void> {
    try {
      const response = await api.get('/api/v1/archive/stats');
      stats.value = response.data.data;
    } catch (err: unknown) {
      console.error('Failed to fetch archive stats:', err);
    }
  }

  // ── Catalog ──────────────────────────────────

  async function fetchCatalog(query: {
    spaceName?: string;
    locationId?: number;
    status?: ArchiveCatalogStatus;
    search?: string;
    dateFrom?: number;
    dateTo?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<void> {
    isCatalogLoading.value = true;
    try {
      const response = await api.get('/api/v1/archive/catalog', { params: query });
      catalogResult.value = response.data.data;
    } catch (err: unknown) {
      console.error('Failed to fetch catalog:', err);
    } finally {
      isCatalogLoading.value = false;
    }
  }

  // ── Archive / Restore ────────────────────────

  async function archiveFiles(
    spaceName: string,
    filePaths: string[],
    archiveLocationId: number,
  ): Promise<{ succeeded: IArchiveCatalogEntry[]; failed: { path: string; error: string }[] } | null> {
    error.value = null;
    try {
      const response = await api.post('/api/v1/archive/files/archive-bulk', {
        spaceName,
        filePaths,
        archiveLocationId,
      });
      return response.data.data;
    } catch (err: unknown) {
      error.value = extractError(err);
      return null;
    }
  }

  async function restoreFile(catalogEntryId: number): Promise<boolean> {
    error.value = null;
    try {
      await api.post('/api/v1/archive/files/restore', { catalogEntryId });
      return true;
    } catch (err: unknown) {
      error.value = extractError(err);
      return false;
    }
  }

  async function bulkRestore(catalogEntryIds: number[]): Promise<boolean> {
    error.value = null;
    try {
      await api.post('/api/v1/archive/files/restore-bulk', { catalogEntryIds });
      return true;
    } catch (err: unknown) {
      error.value = extractError(err);
      return false;
    }
  }

  async function deleteCatalogEntry(id: number): Promise<boolean> {
    error.value = null;
    try {
      await api.delete(`/api/v1/archive/catalog/${id}`);
      return true;
    } catch (err: unknown) {
      error.value = extractError(err);
      return false;
    }
  }

  return {
    locations,
    stats,
    catalogResult,
    isLoading,
    isCatalogLoading,
    error,
    fetchLocations,
    createLocation,
    updateLocation,
    deleteLocation,
    testLocation,
    fetchStats,
    fetchCatalog,
    archiveFiles,
    restoreFile,
    bulkRestore,
    deleteCatalogEntry,
  };
});
