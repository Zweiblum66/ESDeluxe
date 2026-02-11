import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/plugins/axios';
import router from '@/plugins/router';
import type {
  ILoginRequest,
  ILoginResponse,
  ICurrentUser,
  IUserSpacePermission,
  AuthBackendType,
  IAuthBackendsResponse,
} from '@shared/types';

export const useAuthStore = defineStore('auth', () => {
  // --- State ---
  const token = ref<string | null>(localStorage.getItem('es_token'));
  const user = ref<ICurrentUser | null>(
    (() => {
      try {
        const stored = localStorage.getItem('es_user');
        return stored ? JSON.parse(stored) : null;
      } catch {
        return null;
      }
    })()
  );
  const backends = ref<AuthBackendType[]>([]);
  const spaces = ref<IUserSpacePermission[]>([]);
  const managedSpaces = ref<string[]>([]);
  const isLoading = ref(false);
  const loginError = ref<string | null>(null);

  // --- Getters ---
  const isAuthenticated = computed(() => !!token.value && !!user.value);
  const hasAdBackend = computed(() => backends.value.includes('AD'));
  const username = computed(() => user.value?.username ?? '');
  const isAdmin = computed(() => user.value?.isAdmin ?? false);
  const isSomeSpaceManager = computed(() => managedSpaces.value.length > 0);
  const accessibleSpaceNames = computed(() => spaces.value.map((s) => s.spaceName));

  /** Check if the user has any access (read or write) to a space */
  function canReadSpace(spaceName: string): boolean {
    if (isAdmin.value) return true;
    if (managedSpaces.value.includes(spaceName)) return true;
    return spaces.value.some((s) => s.spaceName === spaceName);
  }

  /** Check if the user has write access to a space */
  function canWriteSpace(spaceName: string): boolean {
    if (isAdmin.value) return true;
    if (managedSpaces.value.includes(spaceName)) return true;
    return spaces.value.some((s) => s.spaceName === spaceName && s.accessType === 'readwrite');
  }

  /** Check if the user can manage a space (admin or space manager) */
  function canManageSpace(spaceName: string): boolean {
    if (isAdmin.value) return true;
    return managedSpaces.value.includes(spaceName);
  }

  // --- Actions ---

  /**
   * Login with username and password.
   * Stores JWT in localStorage on success.
   */
  async function login(username: string, password: string): Promise<void> {
    isLoading.value = true;
    loginError.value = null;

    try {
      const payload: ILoginRequest = { username, password };
      const response = await api.post<{ data: ILoginResponse }>('/api/v1/auth/login', payload);
      const data = response.data.data;

      token.value = data.token;
      user.value = data.user;
      backends.value = data.backends;
      spaces.value = data.user.spaces ?? [];
      managedSpaces.value = data.user.managedSpaces ?? [];

      localStorage.setItem('es_token', data.token);
      localStorage.setItem('es_user', JSON.stringify(data.user));

      // Redirect to intended page or default (admin → /users, user → /files)
      const redirect = router.currentRoute.value.query.redirect as string;
      const defaultRoute = data.user.isAdmin ? '/users' : '/files';
      await router.push(redirect || defaultRoute);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      loginError.value = err.response?.data?.message || 'Login failed. Please check your credentials.';
      throw error;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Logout: clear state and navigate to login.
   */
  async function logout(): Promise<void> {
    token.value = null;
    user.value = null;
    backends.value = [];
    spaces.value = [];
    managedSpaces.value = [];

    localStorage.removeItem('es_token');
    localStorage.removeItem('es_user');

    await router.push('/login');
  }

  /**
   * Check authentication with stored token.
   * Calls GET /api/v1/auth/me to validate.
   */
  async function checkAuth(): Promise<void> {
    const storedToken = localStorage.getItem('es_token');
    if (!storedToken) {
      token.value = null;
      user.value = null;
      return;
    }

    isLoading.value = true;
    try {
      token.value = storedToken;
      const response = await api.get<{ data: ICurrentUser }>('/api/v1/auth/me');
      user.value = response.data.data;
      spaces.value = response.data.data.spaces ?? [];
      managedSpaces.value = response.data.data.managedSpaces ?? [];
      localStorage.setItem('es_user', JSON.stringify(response.data.data));
    } catch {
      token.value = null;
      user.value = null;
      spaces.value = [];
      managedSpaces.value = [];
      localStorage.removeItem('es_token');
      localStorage.removeItem('es_user');
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Fetch available auth backends.
   */
  async function fetchBackends(): Promise<void> {
    try {
      const response = await api.get<{ data: IAuthBackendsResponse }>('/api/v1/auth/backends');
      backends.value = response.data.data.backends;
    } catch {
      backends.value = [];
    }
  }

  return {
    // State
    token,
    user,
    backends,
    spaces,
    managedSpaces,
    isLoading,
    loginError,
    // Getters
    isAuthenticated,
    hasAdBackend,
    username,
    isAdmin,
    isSomeSpaceManager,
    accessibleSpaceNames,
    // Methods
    canReadSpace,
    canWriteSpace,
    canManageSpace,
    // Actions
    login,
    logout,
    checkAuth,
    fetchBackends,
  };
});
