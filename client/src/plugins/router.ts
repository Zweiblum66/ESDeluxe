import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';

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
    redirect: '/users',
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: {
      layout: 'app',
      title: 'Dashboard',
      requiresAuth: true,
      section: 'management',
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
      section: 'management',
      icon: 'mdi-shield-key',
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
      section: 'management',
      icon: 'mdi-speedometer',
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
  } else {
    next();
  }
});

export default router;
