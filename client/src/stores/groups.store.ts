import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/plugins/axios';
import type { IGroup, IGroupDetail } from '@shared/types';

interface IGroupListItem extends IGroup {
  memberCount: number;
}

export const useGroupsStore = defineStore('groups', () => {
  const groups = ref<IGroupListItem[]>([]);
  const selectedGroup = ref<IGroupDetail | null>(null);
  const isLoading = ref(false);
  const isDetailLoading = ref(false);
  const error = ref<string | null>(null);

  /**
   * Fetches all groups from the API.
   */
  async function fetchGroups(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await api.get('/api/v1/groups');
      groups.value = response.data.data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load groups';
      error.value = message;
      console.error('Failed to fetch groups:', err);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Fetches detail for a single group including members and spaces.
   */
  async function fetchGroupDetail(name: string): Promise<IGroupDetail | null> {
    isDetailLoading.value = true;
    error.value = null;
    try {
      const response = await api.get(`/api/v1/groups/${encodeURIComponent(name)}`);
      selectedGroup.value = response.data.data;
      return response.data.data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load group detail';
      error.value = message;
      console.error('Failed to fetch group detail:', err);
      return null;
    } finally {
      isDetailLoading.value = false;
    }
  }

  /**
   * Creates a new group.
   */
  async function createGroup(name: string): Promise<boolean> {
    error.value = null;
    try {
      await api.post('/api/v1/groups', { name });
      await fetchGroups();
      return true;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const message = axiosErr.response?.data?.message || 'Failed to create group';
      error.value = message;
      console.error('Failed to create group:', err);
      return false;
    }
  }

  /**
   * Deletes a group.
   */
  async function deleteGroup(name: string): Promise<boolean> {
    error.value = null;
    try {
      await api.delete(`/api/v1/groups/${encodeURIComponent(name)}`);
      await fetchGroups();
      return true;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const message = axiosErr.response?.data?.message || 'Failed to delete group';
      error.value = message;
      console.error('Failed to delete group:', err);
      return false;
    }
  }

  /**
   * Adds a user to a group.
   */
  async function addUserToGroup(groupName: string, username: string): Promise<boolean> {
    error.value = null;
    try {
      await api.post(`/api/v1/groups/${encodeURIComponent(groupName)}/users`, { username });
      return true;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const message = axiosErr.response?.data?.message || 'Failed to add user to group';
      error.value = message;
      console.error('Failed to add user to group:', err);
      return false;
    }
  }

  /**
   * Removes a user from a group.
   */
  async function removeUserFromGroup(groupName: string, username: string): Promise<boolean> {
    error.value = null;
    try {
      await api.delete(
        `/api/v1/groups/${encodeURIComponent(groupName)}/users/${encodeURIComponent(username)}`,
      );
      return true;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const message = axiosErr.response?.data?.message || 'Failed to remove user from group';
      error.value = message;
      console.error('Failed to remove user from group:', err);
      return false;
    }
  }

  function clearSelection(): void {
    selectedGroup.value = null;
  }

  return {
    groups,
    selectedGroup,
    isLoading,
    isDetailLoading,
    error,
    fetchGroups,
    fetchGroupDetail,
    createGroup,
    deleteGroup,
    addUserToGroup,
    removeUserFromGroup,
    clearSelection,
  };
});
