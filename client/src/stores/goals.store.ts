import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/plugins/axios';
import type { IStorageGoal } from '@shared/types';

export const useGoalsStore = defineStore('goals', () => {
  const goals = ref<IStorageGoal[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  async function fetchGoals(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await api.get('/api/v1/goals');
      goals.value = response.data.data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load storage goals';
      error.value = message;
      console.error('Failed to fetch goals:', err);
    } finally {
      isLoading.value = false;
    }
  }

  async function getSpaceGoal(spaceName: string): Promise<string | null> {
    try {
      const response = await api.get(`/api/v1/spaces/${encodeURIComponent(spaceName)}/goal`);
      return response.data.data?.currentGoal || null;
    } catch (err: unknown) {
      console.error('Failed to get space goal:', err);
      return null;
    }
  }

  async function setSpaceGoal(
    spaceName: string,
    goalName: string,
    recursive = false,
  ): Promise<boolean> {
    error.value = null;
    try {
      await api.put(`/api/v1/spaces/${encodeURIComponent(spaceName)}/goal`, {
        goalName,
        recursive,
      });
      return true;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const message = axiosErr.response?.data?.message || 'Failed to set space goal';
      error.value = message;
      return false;
    }
  }

  return {
    goals,
    isLoading,
    error,
    fetchGoals,
    getSpaceGoal,
    setSpaceGoal,
  };
});
