import { ref } from 'vue';
import type { Ref } from 'vue';
import api from '@/plugins/axios';
import type { AxiosRequestConfig, AxiosError } from 'axios';

interface UseApiReturn<T> {
  data: Ref<T | null>;
  isLoading: Ref<boolean>;
  error: Ref<string | null>;
  execute: (config?: AxiosRequestConfig) => Promise<T | null>;
}

/**
 * Composable that wraps axios calls with reactive state.
 *
 * @param url - The API endpoint URL
 * @param initialConfig - Optional initial Axios config (method, data, etc.)
 * @returns Reactive state: data, isLoading, error, and execute function
 *
 * @example
 * ```ts
 * const { data, isLoading, error, execute } = useApi<IUser[]>('/api/v1/users');
 * await execute();
 * ```
 */
export function useApi<T = unknown>(
  url: string,
  initialConfig?: AxiosRequestConfig
): UseApiReturn<T> {
  const data = ref<T | null>(null) as Ref<T | null>;
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  async function execute(overrideConfig?: AxiosRequestConfig): Promise<T | null> {
    isLoading.value = true;
    error.value = null;

    try {
      const config: AxiosRequestConfig = {
        url,
        method: 'GET',
        ...initialConfig,
        ...overrideConfig,
      };

      const response = await api.request<T>(config);
      data.value = response.data;
      return response.data;
    } catch (err) {
      const axiosError = err as AxiosError<{ message?: string }>;
      error.value =
        axiosError.response?.data?.message ||
        axiosError.message ||
        'An unexpected error occurred';
      return null;
    } finally {
      isLoading.value = false;
    }
  }

  return {
    data,
    isLoading,
    error,
    execute,
  };
}
