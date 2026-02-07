<script setup lang="ts">
// Auth layout: centered card on dark background for login/register pages.
</script>

<template>
  <div class="auth-layout">
    <div class="auth-layout__container">
      <router-view />
    </div>
  </div>
</template>

<style scoped lang="scss">
.auth-layout {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #1a1d23;
  overflow: auto;

  &__container {
    width: 100%;
    max-width: 420px;
    padding: 24px;
  }
}
</style>
