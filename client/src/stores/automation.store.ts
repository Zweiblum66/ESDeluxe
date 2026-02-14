import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/plugins/axios';
import type { IAutomationStatus } from '@shared/types';

export const useAutomationStore = defineStore('automation', () => {
  const status = ref<IAutomationStatus | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function fetchStatus(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await api.get('/api/v1/system/automation');
      status.value = response.data.data;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      error.value = axiosErr.response?.data?.message ||
        (err instanceof Error ? err.message : 'Failed to fetch automation status');
      console.error('Failed to fetch automation status:', err);
    } finally {
      isLoading.value = false;
    }
  }

  function startPolling(intervalMs = 5000): void {
    stopPolling();
    fetchStatus();
    pollTimer = setInterval(fetchStatus, intervalMs);
  }

  function stopPolling(): void {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  return {
    status,
    isLoading,
    error,
    fetchStatus,
    startPolling,
    stopPolling,
  };
});
