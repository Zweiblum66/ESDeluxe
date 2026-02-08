import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface INotification {
  id: number;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  timeout?: number;
}

export type ActiveSection = 'management' | 'synchronization' | 'system';

export const useUiStore = defineStore('ui', () => {
  // --- State ---
  const activeSection = ref<ActiveSection>('management');
  const sidebarCollapsed = ref(false);
  const mobileDrawerOpen = ref(false);
  const notifications = ref<INotification[]>([]);

  let notificationCounter = 0;

  // --- Actions ---

  function setActiveSection(section: ActiveSection): void {
    activeSection.value = section;
  }

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  function toggleMobileDrawer(): void {
    mobileDrawerOpen.value = !mobileDrawerOpen.value;
  }

  function closeMobileDrawer(): void {
    mobileDrawerOpen.value = false;
  }

  function addNotification(
    message: string,
    type: INotification['type'] = 'info',
    timeout: number = 5000
  ): void {
    const id = ++notificationCounter;
    notifications.value.push({ id, message, type, timeout });

    if (timeout > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, timeout);
    }
  }

  function removeNotification(id: number): void {
    const index = notifications.value.findIndex((n) => n.id === id);
    if (index !== -1) {
      notifications.value.splice(index, 1);
    }
  }

  function clearNotifications(): void {
    notifications.value = [];
  }

  return {
    // State
    activeSection,
    sidebarCollapsed,
    mobileDrawerOpen,
    notifications,
    // Actions
    setActiveSection,
    toggleSidebar,
    toggleMobileDrawer,
    closeMobileDrawer,
    addNotification,
    removeNotification,
    clearNotifications,
  };
});
