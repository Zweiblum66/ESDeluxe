import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/plugins/axios';
import type { ISpace, ISpaceDetail, SpaceType } from '@shared/types';

export const useSpacesStore = defineStore('spaces', () => {
  const spaces = ref<ISpace[]>([]);
  const selectedSpace = ref<ISpaceDetail | null>(null);
  const isLoading = ref(false);
  const isDetailLoading = ref(false);
  const error = ref<string | null>(null);

  /**
   * Fetches all spaces from the API.
   */
  async function fetchSpaces(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await api.get('/api/v1/spaces');
      spaces.value = response.data.data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load spaces';
      error.value = message;
      console.error('Failed to fetch spaces:', err);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Fetches detail for a single space including users and groups.
   */
  async function fetchSpaceDetail(name: string): Promise<ISpaceDetail | null> {
    isDetailLoading.value = true;
    error.value = null;
    try {
      const response = await api.get(`/api/v1/spaces/${encodeURIComponent(name)}`);
      selectedSpace.value = response.data.data;
      return response.data.data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load space detail';
      error.value = message;
      console.error('Failed to fetch space detail:', err);
      return null;
    } finally {
      isDetailLoading.value = false;
    }
  }

  /**
   * Creates a new media space.
   */
  async function createSpace(name: string, type: SpaceType, quota: number): Promise<boolean> {
    error.value = null;
    try {
      await api.post('/api/v1/spaces', { name, type, quota });
      await fetchSpaces();
      return true;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const message = axiosErr.response?.data?.message || 'Failed to create space';
      error.value = message;
      console.error('Failed to create space:', err);
      return false;
    }
  }

  /**
   * Deletes a space.
   */
  async function deleteSpace(name: string): Promise<boolean> {
    error.value = null;
    try {
      await api.delete(`/api/v1/spaces/${encodeURIComponent(name)}`);
      await fetchSpaces();
      return true;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const message = axiosErr.response?.data?.message || 'Failed to delete space';
      error.value = message;
      console.error('Failed to delete space:', err);
      return false;
    }
  }

  /**
   * Adds a user to a space.
   */
  async function addUserToSpace(
    spaceName: string,
    username: string,
    readonly: boolean = false,
  ): Promise<boolean> {
    error.value = null;
    try {
      await api.post(`/api/v1/spaces/${encodeURIComponent(spaceName)}/users`, {
        username,
        readonly,
      });
      return true;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const message = axiosErr.response?.data?.message || 'Failed to add user to space';
      error.value = message;
      console.error('Failed to add user to space:', err);
      return false;
    }
  }

  /**
   * Removes a user from a space.
   */
  async function removeUserFromSpace(spaceName: string, username: string): Promise<boolean> {
    error.value = null;
    try {
      await api.delete(
        `/api/v1/spaces/${encodeURIComponent(spaceName)}/users/${encodeURIComponent(username)}`,
      );
      return true;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const message = axiosErr.response?.data?.message || 'Failed to remove user from space';
      error.value = message;
      console.error('Failed to remove user from space:', err);
      return false;
    }
  }

  /**
   * Adds a group to a space.
   */
  async function addGroupToSpace(
    spaceName: string,
    groupName: string,
    readonly: boolean = false,
  ): Promise<boolean> {
    error.value = null;
    try {
      await api.post(`/api/v1/spaces/${encodeURIComponent(spaceName)}/groups`, {
        groupName,
        readonly,
      });
      return true;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const message = axiosErr.response?.data?.message || 'Failed to add group to space';
      error.value = message;
      console.error('Failed to add group to space:', err);
      return false;
    }
  }

  /**
   * Removes a group from a space.
   */
  async function removeGroupFromSpace(spaceName: string, groupName: string): Promise<boolean> {
    error.value = null;
    try {
      await api.delete(
        `/api/v1/spaces/${encodeURIComponent(spaceName)}/groups/${encodeURIComponent(groupName)}`,
      );
      return true;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const message = axiosErr.response?.data?.message || 'Failed to remove group from space';
      error.value = message;
      console.error('Failed to remove group from space:', err);
      return false;
    }
  }

  /**
   * Toggles user access type (readonly/readwrite) on a space.
   */
  async function setUserAccess(
    spaceName: string,
    username: string,
    readonly: boolean,
  ): Promise<boolean> {
    error.value = null;
    try {
      await api.put(
        `/api/v1/spaces/${encodeURIComponent(spaceName)}/users/${encodeURIComponent(username)}`,
        { readonly },
      );
      return true;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const message = axiosErr.response?.data?.message || 'Failed to update user access';
      error.value = message;
      console.error('Failed to set user access:', err);
      return false;
    }
  }

  /**
   * Toggles group access type (readonly/readwrite) on a space.
   */
  async function setGroupAccess(
    spaceName: string,
    groupName: string,
    readonly: boolean,
  ): Promise<boolean> {
    error.value = null;
    try {
      await api.put(
        `/api/v1/spaces/${encodeURIComponent(spaceName)}/groups/${encodeURIComponent(groupName)}`,
        { readonly },
      );
      return true;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const message = axiosErr.response?.data?.message || 'Failed to update group access';
      error.value = message;
      console.error('Failed to set group access:', err);
      return false;
    }
  }

  /**
   * Removes a user's permission override, reverting to group-based permissions.
   */
  async function resetUserOverride(spaceName: string, username: string): Promise<boolean> {
    error.value = null;
    try {
      await api.delete(
        `/api/v1/spaces/${encodeURIComponent(spaceName)}/users/${encodeURIComponent(username)}/override`,
      );
      return true;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const message = axiosErr.response?.data?.message || 'Failed to reset user override';
      error.value = message;
      console.error('Failed to reset user override:', err);
      return false;
    }
  }

  function clearSelection(): void {
    selectedSpace.value = null;
  }

  return {
    spaces,
    selectedSpace,
    isLoading,
    isDetailLoading,
    error,
    fetchSpaces,
    fetchSpaceDetail,
    createSpace,
    deleteSpace,
    addUserToSpace,
    removeUserFromSpace,
    setUserAccess,
    resetUserOverride,
    addGroupToSpace,
    removeGroupFromSpace,
    setGroupAccess,
    clearSelection,
  };
});
