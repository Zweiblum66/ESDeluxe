import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/plugins/axios';
import router from '@/plugins/router';
import type {
  ILoginRequest,
  ILoginResponse,
  ICurrentUser,
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
  const isLoading = ref(false);
  const loginError = ref<string | null>(null);

  // --- Getters ---
  const isAuthenticated = computed(() => !!token.value && !!user.value);
  const hasAdBackend = computed(() => backends.value.includes('AD'));
  const username = computed(() => user.value?.username ?? '');
  const isAdmin = computed(() => user.value?.isAdmin ?? false);

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

      localStorage.setItem('es_token', data.token);
      localStorage.setItem('es_user', JSON.stringify(data.user));

      // Redirect to intended page or default
      const redirect = router.currentRoute.value.query.redirect as string;
      await router.push(redirect || '/users');
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
      localStorage.setItem('es_user', JSON.stringify(response.data.data));
    } catch {
      token.value = null;
      user.value = null;
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
    isLoading,
    loginError,
    // Getters
    isAuthenticated,
    hasAdBackend,
    username,
    isAdmin,
    // Actions
    login,
    logout,
    checkAuth,
    fetchBackends,
  };
});
