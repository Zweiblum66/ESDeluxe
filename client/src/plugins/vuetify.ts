import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import { createVuetify } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

const editShareDarkTheme = {
  dark: true,
  colors: {
    background: '#1a1d23',
    surface: '#22252d',
    'surface-variant': '#2a2d35',
    'surface-bright': '#2f323a',
    primary: '#3b82f6',
    secondary: '#6b7280',
    success: '#22c55e',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
    'on-background': '#e5e7eb',
    'on-surface': '#e5e7eb',
    'on-primary': '#ffffff',
    'on-secondary': '#ffffff',
    'on-success': '#ffffff',
    'on-error': '#ffffff',
    'on-warning': '#000000',
    'on-info': '#ffffff',
  },
  variables: {
    'border-color': '#374151',
    'border-opacity': 0.2,
    'high-emphasis-opacity': 0.95,
    'medium-emphasis-opacity': 0.7,
    'disabled-opacity': 0.4,
    'idle-opacity': 0.1,
    'hover-opacity': 0.08,
    'focus-opacity': 0.12,
    'selected-opacity': 0.12,
    'activated-opacity': 0.15,
    'pressed-opacity': 0.16,
    'dragged-opacity': 0.1,
  },
};

export default createVuetify({
  components,
  directives,
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: { mdi },
  },
  theme: {
    defaultTheme: 'editShareDark',
    themes: {
      editShareDark: editShareDarkTheme,
    },
  },
  defaults: {
    VBtn: {
      variant: 'flat',
      rounded: 'lg',
    },
    VCard: {
      rounded: 'lg',
      elevation: 0,
    },
    VTextField: {
      variant: 'outlined',
      density: 'comfortable',
      color: 'primary',
    },
    VSelect: {
      variant: 'outlined',
      density: 'comfortable',
      color: 'primary',
    },
    VDataTable: {
      hover: true,
    },
    VChip: {
      rounded: 'lg',
      size: 'small',
    },
  },
});
