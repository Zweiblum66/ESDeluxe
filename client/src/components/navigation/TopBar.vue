<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';

const route = useRoute();
const authStore = useAuthStore();

const languageMenu = ref(false);
const userMenu = ref(false);

const pageTitle = computed(() => {
  return (route.meta.title as string) || 'ES Manager';
});

const selectedLanguage = ref('English');
const languages = ['English', 'Deutsch', 'Fran\u00e7ais', 'Espa\u00f1ol'];

async function handleLogout(): Promise<void> {
  userMenu.value = false;
  await authStore.logout();
}
</script>

<template>
  <div class="top-bar">
    <!-- Left: Page title -->
    <div class="top-bar__left">
      <h1 class="top-bar__title">{{ pageTitle }}</h1>
    </div>

    <!-- Right: Language + User menu -->
    <div class="top-bar__right">
      <!-- Language selector -->
      <v-menu v-model="languageMenu" :close-on-content-click="true">
        <template #activator="{ props }">
          <v-btn
            v-bind="props"
            variant="text"
            size="small"
            color="secondary"
            class="text-none"
          >
            <v-icon start size="18">mdi-web</v-icon>
            {{ selectedLanguage }}
            <v-icon end size="16">mdi-chevron-down</v-icon>
          </v-btn>
        </template>
        <v-list density="compact" bg-color="surface">
          <v-list-item
            v-for="lang in languages"
            :key="lang"
            :title="lang"
            @click="selectedLanguage = lang"
          />
        </v-list>
      </v-menu>

      <!-- User menu -->
      <v-menu v-model="userMenu" :close-on-content-click="true">
        <template #activator="{ props }">
          <v-btn
            v-bind="props"
            variant="text"
            size="small"
            color="secondary"
            class="text-none ml-2"
          >
            <v-icon start size="20">mdi-account-circle</v-icon>
            {{ authStore.username || 'User' }}
            <v-icon end size="16">mdi-chevron-down</v-icon>
          </v-btn>
        </template>
        <v-list density="compact" bg-color="surface">
          <v-list-item
            prepend-icon="mdi-account"
            title="Profile"
            disabled
          />
          <v-divider />
          <v-list-item
            prepend-icon="mdi-logout"
            title="Logout"
            @click="handleLogout"
          />
        </v-list>
      </v-menu>
    </div>
  </div>
</template>

<style scoped lang="scss">
.top-bar {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background-color: #22252d;
  border-bottom: 1px solid rgba(55, 65, 81, 0.3);

  &__left {
    display: flex;
    align-items: center;
  }

  &__title {
    font-size: 16px;
    font-weight: 600;
    color: #e5e7eb;
    margin: 0;
  }

  &__right {
    display: flex;
    align-items: center;
    gap: 4px;
  }
}
</style>
