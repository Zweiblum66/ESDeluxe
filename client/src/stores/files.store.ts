import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/plugins/axios';
import type {
  ISpace,
  IFileEntry,
  IDirectoryListing,
  IFileAcl,
  ISetAclRequest,
  IDirInfo,
  IFileChunkInfo,
} from '@shared/types';

export const useFilesStore = defineStore('files', () => {
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

  // Detail panel
  const detailEntry = ref<IFileEntry | null>(null);
  const detailAcl = ref<IFileAcl | null>(null);
  const detailGoal = ref<string | null>(null);
  const detailDirInfo = ref<IDirInfo | null>(null);
  const detailChunkInfo = ref<IFileChunkInfo | null>(null);
  const isDetailLoading = ref(false);

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
    detailEntry.value = null;

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

  // --- Move entries ---

  async function moveEntries(
    paths: string[],
    destSpace: string,
    destPath: string,
  ): Promise<{ success: boolean; partialMoves: number }> {
    if (!currentSpace.value) return { success: false, partialMoves: 0 };
    error.value = null;
    let allSuccess = true;
    let partialMoves = 0;

    for (const filePath of paths) {
      try {
        const resp = await api.put(spaceUrl(currentSpace.value, 'move', filePath), {
          destinationSpace: destSpace,
          destinationPath: destPath,
        });
        if (resp.data?.sourceDeleted === false) {
          partialMoves++;
        }
      } catch (err: unknown) {
        error.value = extractError(err);
        allSuccess = false;
        console.error(`Failed to move ${filePath}:`, err);
      }
    }

    selectedEntries.value = [];
    await refresh();
    return { success: allSuccess, partialMoves };
  }

  // --- Detail panel ---

  async function fetchEntryAcl(entry: IFileEntry): Promise<void> {
    if (!currentSpace.value) return;
    isDetailLoading.value = true;
    detailEntry.value = entry;
    detailAcl.value = null;
    detailGoal.value = null;
    detailDirInfo.value = null;
    detailChunkInfo.value = null;

    try {
      const [aclRes, goalRes] = await Promise.all([
        api.get(spaceUrl(currentSpace.value, 'acl', entry.path)),
        api.get(spaceUrl(currentSpace.value, 'goal', entry.path)),
      ]);
      detailAcl.value = aclRes.data.data;
      detailGoal.value = goalRes.data.data?.currentGoal || null;

      // For directories, also fetch dir info
      if (entry.type === 'directory') {
        const infoRes = await api.get(spaceUrl(currentSpace.value, 'info', entry.path));
        detailDirInfo.value = infoRes.data.data;
      }
    } catch (err: unknown) {
      console.error('Failed to fetch entry details:', err);
    } finally {
      isDetailLoading.value = false;
    }
  }

  function clearDetail(): void {
    detailEntry.value = null;
    detailAcl.value = null;
    detailGoal.value = null;
    detailDirInfo.value = null;
    detailChunkInfo.value = null;
  }

  // --- CRUD ---

  async function createDirectory(name: string): Promise<boolean> {
    if (!currentSpace.value) return false;
    error.value = null;
    try {
      const url = currentPath.value
        ? spaceUrl(currentSpace.value, undefined, currentPath.value)
        : spaceUrl(currentSpace.value);
      await api.post(url, { name });
      await refresh();
      return true;
    } catch (err: unknown) {
      error.value = extractError(err);
      return false;
    }
  }

  async function uploadFiles(files: File[]): Promise<{ success: number; failed: number }> {
    if (!currentSpace.value) return { success: 0, failed: files.length };
    error.value = null;
    let success = 0;
    let failed = 0;

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const url = currentPath.value
          ? spaceUrl(currentSpace.value, undefined, currentPath.value)
          : spaceUrl(currentSpace.value);
        await api.post(url, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 600_000, // 10 min for large files
        });
        success++;
      } catch (err: unknown) {
        failed++;
        console.error(`Failed to upload ${file.name}:`, err);
      }
    }

    if (failed > 0) {
      error.value = `${failed} of ${files.length} file(s) failed to upload`;
    }
    await refresh();
    return { success, failed };
  }

  async function deleteEntries(paths: string[]): Promise<boolean> {
    if (!currentSpace.value) return false;
    error.value = null;
    let allSuccess = true;

    for (const filePath of paths) {
      try {
        await api.delete(spaceUrl(currentSpace.value, undefined, filePath));
      } catch (err: unknown) {
        error.value = extractError(err);
        allSuccess = false;
        console.error(`Failed to delete ${filePath}:`, err);
      }
    }

    selectedEntries.value = [];
    await refresh();
    return allSuccess;
  }

  async function renameEntry(filePath: string, newName: string): Promise<boolean> {
    if (!currentSpace.value) return false;
    error.value = null;
    try {
      await api.put(spaceUrl(currentSpace.value, 'rename', filePath), { newName });
      await refresh();
      return true;
    } catch (err: unknown) {
      error.value = extractError(err);
      return false;
    }
  }

  function downloadEntry(filePath: string): void {
    if (!currentSpace.value) return;
    const url = spaceUrl(currentSpace.value, 'download', filePath);
    // Use a hidden anchor to trigger browser download
    const token = localStorage.getItem('es_token');
    const link = document.createElement('a');
    // We need to fetch with auth, so use a fetch + blob approach
    api.get(url, { responseType: 'blob', timeout: 600_000 })
      .then((response) => {
        const blob = new Blob([response.data]);
        const objectUrl = URL.createObjectURL(blob);
        link.href = objectUrl;
        link.download = filePath.split('/').pop() || 'download';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
      })
      .catch((err) => {
        error.value = extractError(err);
        console.error('Download failed:', err);
      });
  }

  // --- ACL ---

  async function setFileAcl(filePath: string, acl: ISetAclRequest): Promise<boolean> {
    if (!currentSpace.value) return false;
    error.value = null;
    try {
      await api.put(spaceUrl(currentSpace.value, 'acl', filePath), acl);
      // Refresh detail if viewing same entry
      if (detailEntry.value && detailEntry.value.path === filePath) {
        await fetchEntryAcl(detailEntry.value);
      }
      return true;
    } catch (err: unknown) {
      error.value = extractError(err);
      return false;
    }
  }

  // --- Goals ---

  async function setFileGoal(
    filePath: string,
    goalName: string,
    recursive = false,
  ): Promise<boolean> {
    if (!currentSpace.value) return false;
    error.value = null;
    try {
      await api.put(spaceUrl(currentSpace.value, 'goal', filePath), { goalName, recursive });
      // Refresh detail
      if (detailEntry.value && detailEntry.value.path === filePath) {
        detailGoal.value = goalName;
      }
      return true;
    } catch (err: unknown) {
      error.value = extractError(err);
      return false;
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
    detailEntry,
    detailAcl,
    detailGoal,
    detailDirInfo,
    detailChunkInfo,
    isDetailLoading,
    // Computed
    breadcrumbs,
    // Actions
    fetchSpaces,
    navigate,
    refresh,
    fetchEntryAcl,
    clearDetail,
    createDirectory,
    uploadFiles,
    deleteEntries,
    renameEntry,
    downloadEntry,
    setFileAcl,
    setFileGoal,
    fetchSubdirectories,
    moveEntries,
  };
});
