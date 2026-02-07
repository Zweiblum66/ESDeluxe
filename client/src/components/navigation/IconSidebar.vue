<script setup lang="ts">
import { useUiStore } from '@/stores/ui.store';
import type { ActiveSection } from '@/stores/ui.store';

const uiStore = useUiStore();

interface SectionItem {
  id: ActiveSection;
  icon: string;
  label: string;
}

const sections: SectionItem[] = [
  { id: 'management', icon: 'mdi-view-dashboard', label: 'Management' },
  { id: 'synchronization', icon: 'mdi-sync', label: 'Synchronization' },
  { id: 'system', icon: 'mdi-cog', label: 'System' },
];

function handleSectionClick(section: ActiveSection): void {
  uiStore.setActiveSection(section);
}
</script>

<template>
  <div class="icon-sidebar">
    <!-- Logo placeholder -->
    <div class="icon-sidebar__logo">
      <v-icon size="28" color="primary">mdi-server</v-icon>
    </div>

    <!-- Section icons -->
    <div class="icon-sidebar__sections">
      <v-tooltip
        v-for="section in sections"
        :key="section.id"
        :text="section.label"
        location="end"
      >
        <template #activator="{ props }">
          <button
            v-bind="props"
            class="icon-sidebar__btn"
            :class="{ 'icon-sidebar__btn--active': uiStore.activeSection === section.id }"
            @click="handleSectionClick(section.id)"
          >
            <span class="icon-sidebar__indicator" />
            <v-icon size="22">{{ section.icon }}</v-icon>
          </button>
        </template>
      </v-tooltip>
    </div>
  </div>
</template>

<style scoped lang="scss">
.icon-sidebar {
  width: 56px;
  height: 100vh;
  background-color: #15171c;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-right: 1px solid rgba(55, 65, 81, 0.3);
  position: fixed;
  left: 0;
  top: 0;
  z-index: 1010;

  &__logo {
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    border-bottom: 1px solid rgba(55, 65, 81, 0.3);
  }

  &__sections {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding-top: 12px;
    width: 100%;
  }

  &__btn {
    position: relative;
    width: 100%;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    color: #6b7280;
    transition: all 150ms ease;

    &:hover {
      color: #e5e7eb;
      background-color: rgba(255, 255, 255, 0.05);
    }

    &--active {
      color: #e5e7eb;
      background-color: rgba(59, 130, 246, 0.1);

      .icon-sidebar__indicator {
        opacity: 1;
      }
    }
  }

  &__indicator {
    position: absolute;
    left: 0;
    top: 8px;
    bottom: 8px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background-color: #3b82f6;
    opacity: 0;
    transition: opacity 150ms ease;
  }
}
</style>
