import { computed } from 'vue';
import { useDisplay } from 'vuetify';

export function useResponsive() {
  const { xs, smAndDown, mdAndDown } = useDisplay();

  return {
    /** Phone only (< 600px) */
    isPhone: xs,
    /** Tablet and below (< 960px) — overlay drawer navigation */
    isMobile: smAndDown,
    /** Desktop and up (>= 960px) — fixed sidebar navigation */
    isDesktop: computed(() => !smAndDown.value),
    /** Make detail dialogs fullscreen on phone */
    dialogFullscreen: xs,
  };
}
