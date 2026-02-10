import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/plugins/axios';
import type { ISpaceManagersResponse } from '@shared/types';

export const useRolesStore = defineStore('roles', () => {
  // --- State ---
  const assignments = ref<ISpaceManagersResponse[]>([]);
  const selectedSpace = ref<ISpaceManagersResponse | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // --- Actions ---

  /** Fetch all space manager assignments */
  async function fetchAll(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await api.get<{ data: ISpaceManagersResponse[] }>('/api/v1/roles');
      assignments.value = response.data.data;
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      error.value = e.response?.data?.message || 'Failed to fetch role assignments';
      console.error('Failed to fetch role assignments:', err);
    } finally {
      isLoading.value = false;
    }
  }

  /** Fetch managers for a specific space */
  async function fetchForSpace(spaceName: string): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await api.get<{ data: ISpaceManagersResponse }>(
        `/api/v1/roles/spaces/${encodeURIComponent(spaceName)}`,
      );
      selectedSpace.value = response.data.data;

      // Update in the full list too
      const idx = assignments.value.findIndex((a) => a.spaceName === spaceName);
      if (idx >= 0) {
        assignments.value[idx] = response.data.data;
      } else {
        assignments.value.push(response.data.data);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      error.value = e.response?.data?.message || 'Failed to fetch space managers';
      console.error('Failed to fetch space managers:', err);
    } finally {
      isLoading.value = false;
    }
  }

  /** Assign a user or group as space manager */
  async function assignManager(
    spaceName: string,
    assigneeType: 'user' | 'group',
    assigneeName: string,
  ): Promise<boolean> {
    error.value = null;
    try {
      await api.post(`/api/v1/roles/spaces/${encodeURIComponent(spaceName)}`, {
        assigneeType,
        assigneeName,
      });
      // Refresh data for this space
      await fetchForSpace(spaceName);
      return true;
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      error.value = e.response?.data?.message || 'Failed to assign manager';
      console.error('Failed to assign manager:', err);
      return false;
    }
  }

  /** Remove a user or group as space manager */
  async function removeManager(
    spaceName: string,
    assigneeType: 'user' | 'group',
    assigneeName: string,
  ): Promise<boolean> {
    error.value = null;
    try {
      await api.delete(`/api/v1/roles/spaces/${encodeURIComponent(spaceName)}`, {
        data: { assigneeType, assigneeName },
      });
      // Refresh data for this space
      await fetchForSpace(spaceName);
      return true;
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      error.value = e.response?.data?.message || 'Failed to remove manager';
      console.error('Failed to remove manager:', err);
      return false;
    }
  }

  return {
    assignments,
    selectedSpace,
    isLoading,
    error,
    fetchAll,
    fetchForSpace,
    assignManager,
    removeManager,
  };
});
