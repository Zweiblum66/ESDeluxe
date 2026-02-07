<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth.store';

const authStore = useAuthStore();

const username = ref('');
const password = ref('');
const showPassword = ref(false);
const isSubmitting = ref(false);
const errorMessage = ref('');

async function handleLogin(): Promise<void> {
  if (!username.value || !password.value) {
    errorMessage.value = 'Please enter username and password.';
    return;
  }

  isSubmitting.value = true;
  errorMessage.value = '';

  try {
    await authStore.login(username.value, password.value);
  } catch {
    errorMessage.value = authStore.loginError || 'Login failed. Please check your credentials.';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <v-card class="login-card" elevation="8">
    <!-- Logo / Header area -->
    <div class="login-card__header">
      <v-icon size="48" color="primary" class="mb-3">mdi-server</v-icon>
      <h1 class="login-card__title">ES Manager</h1>
      <p class="login-card__subtitle">EditShare Storage Management</p>
    </div>

    <v-card-text class="login-card__form">
      <!-- Error alert -->
      <v-alert
        v-if="errorMessage"
        type="error"
        variant="tonal"
        density="compact"
        closable
        class="mb-4"
        @click:close="errorMessage = ''"
      >
        {{ errorMessage }}
      </v-alert>

      <!-- Login form -->
      <v-form @submit.prevent="handleLogin">
        <v-text-field
          v-model="username"
          label="Username"
          prepend-inner-icon="mdi-account"
          variant="outlined"
          density="comfortable"
          :disabled="isSubmitting"
          autocomplete="username"
          class="mb-3"
        />

        <v-text-field
          v-model="password"
          label="Password"
          prepend-inner-icon="mdi-lock"
          :type="showPassword ? 'text' : 'password'"
          :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
          variant="outlined"
          density="comfortable"
          :disabled="isSubmitting"
          autocomplete="current-password"
          class="mb-4"
          @click:append-inner="showPassword = !showPassword"
        />

        <v-btn
          type="submit"
          color="primary"
          size="large"
          block
          :loading="isSubmitting"
          :disabled="isSubmitting || !username || !password"
        >
          Sign In
        </v-btn>
      </v-form>
    </v-card-text>
  </v-card>
</template>

<style scoped lang="scss">
.login-card {
  background-color: #22252d !important;
  border: 1px solid rgba(55, 65, 81, 0.3);

  &__header {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32px 24px 8px;
  }

  &__title {
    font-size: 24px;
    font-weight: 700;
    color: #e5e7eb;
    margin: 0;
  }

  &__subtitle {
    font-size: 14px;
    color: #6b7280;
    margin: 4px 0 0;
  }

  &__form {
    padding: 24px;
  }
}
</style>
