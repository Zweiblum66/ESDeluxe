import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/plugins/axios';
import type {
  ITieringRule,
  ICreateTieringRuleRequest,
  IUpdateTieringRuleRequest,
  ITieringExecutionLog,
  ITieringSchedulerStatus,
} from '@shared/types';

export const useTieringStore = defineStore('tiering', () => {
  const rules = ref<ITieringRule[]>([]);
  const selectedRule = ref<ITieringRule | null>(null);
  const ruleLogs = ref<ITieringExecutionLog[]>([]);
  const recentLogs = ref<ITieringExecutionLog[]>([]);
  const schedulerStatus = ref<ITieringSchedulerStatus | null>(null);
  const isLoading = ref(false);
  const isDetailLoading = ref(false);
  const error = ref<string | null>(null);

  function extractError(err: unknown): string {
    const axiosErr = err as { response?: { data?: { message?: string } } };
    return axiosErr.response?.data?.message ||
      (err instanceof Error ? err.message : 'An error occurred');
  }

  // --- Rules ---

  async function fetchRules(spaceName?: string): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const params = spaceName ? { spaceName } : {};
      const response = await api.get('/api/v1/tiering/rules', { params });
      rules.value = response.data.data;
    } catch (err: unknown) {
      error.value = extractError(err);
      console.error('Failed to fetch tiering rules:', err);
    } finally {
      isLoading.value = false;
    }
  }

  async function fetchRule(id: number): Promise<ITieringRule | null> {
    isDetailLoading.value = true;
    error.value = null;
    try {
      const response = await api.get(`/api/v1/tiering/rules/${id}`);
      selectedRule.value = response.data.data;
      return response.data.data;
    } catch (err: unknown) {
      error.value = extractError(err);
      return null;
    } finally {
      isDetailLoading.value = false;
    }
  }

  async function createRule(request: ICreateTieringRuleRequest): Promise<boolean> {
    error.value = null;
    try {
      await api.post('/api/v1/tiering/rules', request);
      await fetchRules();
      return true;
    } catch (err: unknown) {
      error.value = extractError(err);
      return false;
    }
  }

  async function updateRule(id: number, request: IUpdateTieringRuleRequest): Promise<boolean> {
    error.value = null;
    try {
      await api.put(`/api/v1/tiering/rules/${id}`, request);
      await fetchRules();
      return true;
    } catch (err: unknown) {
      error.value = extractError(err);
      return false;
    }
  }

  async function deleteRule(id: number): Promise<boolean> {
    error.value = null;
    try {
      await api.delete(`/api/v1/tiering/rules/${id}`);
      await fetchRules();
      return true;
    } catch (err: unknown) {
      error.value = extractError(err);
      return false;
    }
  }

  async function triggerRule(id: number): Promise<boolean> {
    error.value = null;
    try {
      await api.post(`/api/v1/tiering/rules/${id}/run`);
      await fetchRules();
      return true;
    } catch (err: unknown) {
      error.value = extractError(err);
      return false;
    }
  }

  // --- Logs ---

  async function fetchRuleLogs(ruleId: number): Promise<void> {
    try {
      const response = await api.get(`/api/v1/tiering/rules/${ruleId}/logs`);
      ruleLogs.value = response.data.data;
    } catch (err: unknown) {
      console.error('Failed to fetch rule logs:', err);
    }
  }

  async function fetchRecentLogs(): Promise<void> {
    try {
      const response = await api.get('/api/v1/tiering/logs');
      recentLogs.value = response.data.data;
    } catch (err: unknown) {
      console.error('Failed to fetch recent logs:', err);
    }
  }

  // --- Scheduler ---

  async function fetchSchedulerStatus(): Promise<void> {
    try {
      const response = await api.get('/api/v1/tiering/status');
      schedulerStatus.value = response.data.data;
    } catch (err: unknown) {
      console.error('Failed to fetch scheduler status:', err);
    }
  }

  return {
    rules,
    selectedRule,
    ruleLogs,
    recentLogs,
    schedulerStatus,
    isLoading,
    isDetailLoading,
    error,
    fetchRules,
    fetchRule,
    createRule,
    updateRule,
    deleteRule,
    triggerRule,
    fetchRuleLogs,
    fetchRecentLogs,
    fetchSchedulerStatus,
  };
});
