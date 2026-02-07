import { useUiStore } from '@/stores/ui.store';

/**
 * Composable for toast/snackbar notifications.
 * Works with the Vuetify snackbar displayed in App.vue via the UI store.
 *
 * @example
 * ```ts
 * const { success, error, warning, info } = useNotification();
 * success('User created successfully');
 * error('Failed to delete group');
 * ```
 */
export function useNotification() {
  const uiStore = useUiStore();

  function success(message: string, timeout = 4000): void {
    uiStore.addNotification(message, 'success', timeout);
  }

  function error(message: string, timeout = 6000): void {
    uiStore.addNotification(message, 'error', timeout);
  }

  function warning(message: string, timeout = 5000): void {
    uiStore.addNotification(message, 'warning', timeout);
  }

  function info(message: string, timeout = 4000): void {
    uiStore.addNotification(message, 'info', timeout);
  }

  return {
    success,
    error,
    warning,
    info,
  };
}
