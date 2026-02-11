import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/plugins/axios';
import type { ISpace, IFileEntry, IDirectoryListing } from '@shared/types';

export const useTieringBrowserStore = defineStore('tiering-browser', () => {
  // --- State ---
  const spaces = ref<ISpace[]>([]);
  const currentSpace = ref<string | null>(null);
  const currentPath = ref('');
  const entries = ref<IFileEntry[]>([]);
  const totalSize = ref(0);
  const totalFiles = ref(0);
  const totalDirs = ref(0);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // Selection
  const selectedEntries = ref<string[]>([]);

  // Goal state
  const entryGoals = ref(new Map<string, string>());
  const spaceGoal = ref<string | null>(null);
  const isLoadingGoals = ref(false);
  const isSavingGoal = ref(false);

  // --- Computed ---
  const breadcrumbs = computed(() => {
    const parts: { label: string; path: string }[] = [
      { label: currentSpace.value || 'Root', path: '' },
    ];
    if (currentPath.value) {
      const segments = currentPath.value.split('/');
      let accumulated = '';
      for (const segment of segments) {
        accumulated = accumulated ? `${accumulated}/${segment}` : segment;
        parts.push({ label: segment, path: accumulated });
      }
    }
    return parts;
  });

  // --- Helpers ---
  function spaceUrl(spaceName: string, action?: string, filePath?: string): string {
    const base = `/api/v1/spaces/${encodeURIComponent(spaceName)}/files`;
    if (action && filePath) {
      return `${base}/${action}/${filePath}`;
    }
    if (action) {
      return `${base}/${action}`;
    }
    if (filePath) {
      return `${base}/${filePath}`;
    }
    return base;
  }

  function extractError(err: unknown): string {
    const axiosErr = err as { response?: { data?: { message?: string; error?: string } } };
    return axiosErr.response?.data?.message || axiosErr.response?.data?.error ||
      (err instanceof Error ? err.message : 'An error occurred');
  }

  // --- Actions ---

  async function fetchSpaces(): Promise<void> {
    try {
      const response = await api.get('/api/v1/spaces');
      spaces.value = response.data.data;
    } catch (err: unknown) {
      console.error('Failed to fetch spaces:', err);
    }
  }

  async function navigate(spaceName: string, path = ''): Promise<void> {
    isLoading.value = true;
    error.value = null;
    currentSpace.value = spaceName;
    currentPath.value = path;
    selectedEntries.value = [];
    entryGoals.value = new Map();

    try {
      const url = path ? spaceUrl(spaceName, undefined, path) : spaceUrl(spaceName);
      const response = await api.get(url);
      const listing: IDirectoryListing = response.data.data;
      entries.value = listing.entries;
      totalSize.value = listing.totalSize;
      totalFiles.value = listing.totalFiles;
      totalDirs.value = listing.totalDirs;
    } catch (err: unknown) {
      error.value = extractError(err);
      entries.value = [];
      totalSize.value = 0;
      totalFiles.value = 0;
      totalDirs.value = 0;
      console.error('Failed to navigate:', err);
    } finally {
      isLoading.value = false;
    }

    // Fetch space goal when space changes
    fetchSpaceGoal(spaceName);

    // Batch-fetch goals for all entries
    if (entries.value.length > 0) {
      fetchEntryGoals();
    }
  }

  async function refresh(): Promise<void> {
    if (currentSpace.value) {
      await navigate(currentSpace.value, currentPath.value);
    }
  }

  // --- Subdirectory listing (for tree sidebar) ---

  async function fetchSubdirectories(
    spaceName: string,
    dirPath?: string,
  ): Promise<{ name: string; path: string }[]> {
    try {
      const url = dirPath
        ? spaceUrl(spaceName, 'dirs', dirPath)
        : `/api/v1/spaces/${encodeURIComponent(spaceName)}/files/dirs`;
      const response = await api.get(url);
      return response.data.data;
    } catch (err: unknown) {
      console.error('Failed to fetch subdirectories:', err);
      return [];
    }
  }

  // --- Goal operations ---

  async function fetchSpaceGoal(spaceName: string): Promise<void> {
    try {
      const response = await api.get(`/api/v1/spaces/${encodeURIComponent(spaceName)}/goal`);
      spaceGoal.value = response.data.data?.currentGoal || null;
    } catch (err: unknown) {
      console.error('Failed to fetch space goal:', err);
      spaceGoal.value = null;
    }
  }

  async function fetchEntryGoals(): Promise<void> {
    if (!currentSpace.value || entries.value.length === 0) return;

    isLoadingGoals.value = true;
    const spaceName = currentSpace.value;
    const newGoals = new Map<string, string>();

    const results = await Promise.allSettled(
      entries.value.map(async (entry) => {
        const url = spaceUrl(spaceName, 'goal', entry.path);
        const response = await api.get(url);
        const goal = response.data.data?.currentGoal;
        return { path: entry.path, goal: goal || null };
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.goal) {
        newGoals.set(result.value.path, result.value.goal);
      }
    }

    entryGoals.value = newGoals;
    isLoadingGoals.value = false;
  }

  async function setEntryGoal(
    filePath: string,
    goalName: string,
    recursive = false,
  ): Promise<boolean> {
    if (!currentSpace.value) return false;
    error.value = null;
    try {
      await api.put(spaceUrl(currentSpace.value, 'goal', filePath), {
        goalName,
        recursive,
      });
      // Update local goal state immediately
      const updated = new Map(entryGoals.value);
      updated.set(filePath, goalName);
      entryGoals.value = updated;
      return true;
    } catch (err: unknown) {
      error.value = extractError(err);
      return false;
    }
  }

  async function setBulkGoal(
    paths: string[],
    goalName: string,
    recursive = false,
  ): Promise<boolean> {
    if (!currentSpace.value) return false;
    isSavingGoal.value = true;
    error.value = null;
    let allSuccess = true;

    for (const filePath of paths) {
      const success = await setEntryGoal(filePath, goalName, recursive);
      if (!success) allSuccess = false;
    }

    isSavingGoal.value = false;
    // Refresh goals to get accurate state
    await fetchEntryGoals();
    return allSuccess;
  }

  async function setSpaceGoalAction(
    spaceName: string,
    goalName: string,
    recursive = false,
  ): Promise<boolean> {
    isSavingGoal.value = true;
    error.value = null;
    try {
      await api.put(`/api/v1/spaces/${encodeURIComponent(spaceName)}/goal`, {
        goalName,
        recursive,
      });
      spaceGoal.value = goalName;
      // If recursive, refresh entry goals since they may have changed
      if (recursive) {
        await fetchEntryGoals();
      }
      return true;
    } catch (err: unknown) {
      error.value = extractError(err);
      return false;
    } finally {
      isSavingGoal.value = false;
    }
  }

  return {
    // State
    spaces,
    currentSpace,
    currentPath,
    entries,
    totalSize,
    totalFiles,
    totalDirs,
    isLoading,
    error,
    selectedEntries,
    entryGoals,
    spaceGoal,
    isLoadingGoals,
    isSavingGoal,

    // Computed
    breadcrumbs,

    // Actions
    fetchSpaces,
    navigate,
    refresh,
    fetchSubdirectories,
    fetchSpaceGoal,
    fetchEntryGoals,
    setEntryGoal,
    setBulkGoal,
    setSpaceGoal: setSpaceGoalAction,
  };
});
