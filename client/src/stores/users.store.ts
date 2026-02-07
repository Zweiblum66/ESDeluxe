import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/plugins/axios';
import type { IUser, IUserDetail } from '@shared/types';

export const useUsersStore = defineStore('users', () => {
  const users = ref<IUser[]>([]);
  const selectedUser = ref<IUserDetail | null>(null);
  const isLoading = ref(false);
  const isDetailLoading = ref(false);
  const error = ref<string | null>(null);

  /**
   * Fetches all users from the API.
   */
  async function fetchUsers(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await api.get('/api/v1/users');
      users.value = response.data.data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load users';
      error.value = message;
      console.error('Failed to fetch users:', err);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Fetches detail for a single user including spaces and groups.
   */
  async function fetchUserDetail(username: string): Promise<IUserDetail | null> {
    isDetailLoading.value = true;
    error.value = null;
    try {
      const response = await api.get(`/api/v1/users/${encodeURIComponent(username)}`);
      selectedUser.value = response.data.data;
      return response.data.data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load user detail';
      error.value = message;
      console.error('Failed to fetch user detail:', err);
      return null;
    } finally {
      isDetailLoading.value = false;
    }
  }

  /**
   * Creates a new user.
   */
  async function createUser(username: string, password: string): Promise<boolean> {
    error.value = null;
    try {
      await api.post('/api/v1/users', { username, password });
      await fetchUsers(); // Refresh the list
      return true;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const message = axiosErr.response?.data?.message || 'Failed to create user';
      error.value = message;
      console.error('Failed to create user:', err);
      return false;
    }
  }

  /**
   * Deletes a user.
   */
  async function deleteUser(username: string): Promise<boolean> {
    error.value = null;
    try {
      await api.delete(`/api/v1/users/${encodeURIComponent(username)}`);
      await fetchUsers(); // Refresh the list
      return true;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const message = axiosErr.response?.data?.message || 'Failed to delete user';
      error.value = message;
      console.error('Failed to delete user:', err);
      return false;
    }
  }

  /**
   * Updates a user's password.
   */
  async function updatePassword(username: string, password: string): Promise<boolean> {
    error.value = null;
    try {
      await api.put(`/api/v1/users/${encodeURIComponent(username)}/password`, {
        password,
      });
      return true;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const message = axiosErr.response?.data?.message || 'Failed to update password';
      error.value = message;
      console.error('Failed to update password:', err);
      return false;
    }
  }

  function clearSelection(): void {
    selectedUser.value = null;
  }

  return {
    users,
    selectedUser,
    isLoading,
    isDetailLoading,
    error,
    fetchUsers,
    fetchUserDetail,
    createUser,
    deleteUser,
    updatePassword,
    clearSelection,
  };
});
