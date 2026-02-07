<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useUiStore } from '@/stores/ui.store';
import AuthLayout from '@/layouts/AuthLayout.vue';
import AppShell from '@/layouts/AppShell.vue';

const route = useRoute();
const uiStore = useUiStore();

const layout = computed(() => {
  const meta = route.meta.layout;
  if (meta === 'auth') return AuthLayout;
  return AppShell;
});

const notificationColor: Record<string, string> = {
  success: 'success',
  error: 'error',
  warning: 'warning',
  info: 'info',
};
</script>

<template>
  <v-app>
    <component :is="layout">
      <router-view />
    </component>

    <!-- Global notification snackbar -->
    <template v-for="notification in uiStore.notifications" :key="notification.id">
      <v-snackbar
        :model-value="true"
        :timeout="notification.timeout"
        :color="notificationColor[notification.type] || 'info'"
        location="top right"
        @update:model-value="uiStore.removeNotification(notification.id)"
      >
        {{ notification.message }}
        <template #actions>
          <v-btn
            variant="text"
            size="small"
            @click="uiStore.removeNotification(notification.id)"
          >
            Close
          </v-btn>
        </template>
      </v-snackbar>
    </template>
  </v-app>
</template>
