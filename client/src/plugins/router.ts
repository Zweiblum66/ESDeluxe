import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: {
      layout: 'auth',
      title: 'Login',
      requiresAuth: false,
    },
  },
  {
    path: '/',
    redirect: '/files',
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: {
      layout: 'app',
      title: 'Dashboard',
      requiresAuth: true,
      section: 'system',
    },
  },
  {
    path: '/users',
    name: 'users',
    component: () => import('@/views/users/UsersListView.vue'),
    meta: {
      layout: 'app',
      title: 'Users',
      requiresAuth: true,
      requiresAdmin: true,
      section: 'management',
      icon: 'mdi-account-multiple',
    },
  },
  {
    path: '/groups',
    name: 'groups',
    component: () => import('@/views/groups/GroupsListView.vue'),
    meta: {
      layout: 'app',
      title: 'Groups',
      requiresAuth: true,
      requiresAdmin: true,
      section: 'management',
      icon: 'mdi-account-group',
    },
  },
  {
    path: '/spaces',
    name: 'spaces',
    component: () => import('@/views/spaces/SpacesListView.vue'),
    meta: {
      layout: 'app',
      title: 'Media Spaces',
      requiresAuth: true,
      requiresAdminOrManager: true,
      section: 'management',
      icon: 'mdi-folder-multiple',
    },
  },
  {
    path: '/access',
    name: 'access',
    component: () => import('@/views/access/AccessManagementView.vue'),
    meta: {
      layout: 'app',
      title: 'Access',
      requiresAuth: true,
      requiresAdminOrManager: true,
      section: 'management',
      icon: 'mdi-shield-key',
    },
  },
  {
    path: '/roles',
    name: 'roles',
    component: () => import('@/views/roles/RolesView.vue'),
    meta: {
      layout: 'app',
      title: 'Permissions',
      requiresAuth: true,
      requiresAdmin: true,
      section: 'management',
      icon: 'mdi-shield-account',
    },
  },
  {
    path: '/qos',
    name: 'qos',
    component: () => import('@/views/qos/QosView.vue'),
    meta: {
      layout: 'app',
      title: 'QoS',
      requiresAuth: true,
      requiresAdmin: true,
      section: 'management',
      icon: 'mdi-speedometer',
    },
  },
  {
    path: '/files',
    name: 'files',
    component: () => import('@/views/files/FileBrowserView.vue'),
    meta: {
      layout: 'app',
      title: 'File Browser',
      requiresAuth: true,
      section: 'management',
      icon: 'mdi-file-tree',
    },
  },
  {
    path: '/files/:spaceName',
    name: 'files-space',
    component: () => import('@/views/files/FileBrowserView.vue'),
    meta: {
      layout: 'app',
      title: 'File Browser',
      requiresAuth: true,
      section: 'management',
      icon: 'mdi-file-tree',
    },
  },
  {
    path: '/files/:spaceName/:pathMatch(.*)*',
    name: 'files-path',
    component: () => import('@/views/files/FileBrowserView.vue'),
    meta: {
      layout: 'app',
      title: 'File Browser',
      requiresAuth: true,
      section: 'management',
      icon: 'mdi-file-tree',
    },
  },
  {
    path: '/tiering',
    name: 'tiering',
    component: () => import('@/views/tiering/TieringView.vue'),
    meta: {
      layout: 'app',
      title: 'Automated Tiering',
      requiresAuth: true,
      requiresAdmin: true,
      section: 'management',
      icon: 'mdi-swap-vertical-bold',
    },
  },
  {
    path: '/tiering-browser',
    name: 'tiering-browser',
    component: () => import('@/views/tiering-browser/TieringBrowserView.vue'),
    meta: {
      layout: 'app',
      title: 'Tiering Browser',
      requiresAuth: true,
      section: 'management',
      icon: 'mdi-layers-triple',
    },
  },
  {
    path: '/tiering-browser/:spaceName',
    name: 'tiering-browser-space',
    component: () => import('@/views/tiering-browser/TieringBrowserView.vue'),
    meta: {
      layout: 'app',
      title: 'Tiering Browser',
      requiresAuth: true,
      section: 'management',
      icon: 'mdi-layers-triple',
    },
  },
  {
    path: '/tiering-browser/:spaceName/:pathMatch(.*)*',
    name: 'tiering-browser-path',
    component: () => import('@/views/tiering-browser/TieringBrowserView.vue'),
    meta: {
      layout: 'app',
      title: 'Tiering Browser',
      requiresAuth: true,
      section: 'management',
      icon: 'mdi-layers-triple',
    },
  },
  {
    path: '/archive',
    name: 'archive',
    component: () => import('@/views/archive/ArchiveView.vue'),
    meta: {
      layout: 'app',
      title: 'Archive',
      requiresAuth: true,
      section: 'management',
      icon: 'mdi-archive',
    },
  },
  {
    path: '/trash',
    name: 'trash',
    component: () => import('@/views/trash/TrashView.vue'),
    meta: {
      layout: 'app',
      title: 'Trash',
      requiresAuth: true,
      section: 'management',
      icon: 'mdi-delete',
    },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Navigation guard
router.beforeEach(async (to, _from, next) => {
  const requiresAuth = to.meta.requiresAuth !== false;

  if (!requiresAuth) {
    next();
    return;
  }

  const authStore = useAuthStore();

  // If we have a token but no user info, try to validate
  if (!authStore.isAuthenticated && localStorage.getItem('es_token')) {
    try {
      await authStore.checkAuth();
    } catch {
      // Token is invalid, will redirect to login below
    }
  }

  if (requiresAuth && !authStore.isAuthenticated) {
    next({ name: 'login', query: { redirect: to.fullPath } });
    return;
  }

  // Admin-only route guard
  if (to.meta.requiresAdmin && !authStore.isAdmin) {
    next({ name: 'files' });
    return;
  }

  // Admin-or-manager route guard (spaces, access views)
  if (to.meta.requiresAdminOrManager && !authStore.isAdmin && !authStore.isSomeSpaceManager) {
    next({ name: 'files' });
    return;
  }

  next();
});

// Close mobile navigation drawer on route change
router.afterEach(() => {
  const uiStore = useUiStore();
  uiStore.closeMobileDrawer();
});

export default router;
