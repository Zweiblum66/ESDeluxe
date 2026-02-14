import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/plugins/axios';
import type {
  IGuardianEvent,
  IGuardianReceiverStatus,
  IGuardianEventStats,
  IGuardianTimelineBucket,
  GuardianEventType,
} from '@shared/types/guardian';

export type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d';

const TIME_RANGE_SECONDS: Record<TimeRange, number> = {
  '1h': 3600,
  '6h': 21600,
  '24h': 86400,
  '7d': 604800,
  '30d': 2592000,
};

export const useGuardianStore = defineStore('guardian', () => {
  // ── State ──────────────────────────────────────
  const status = ref<IGuardianReceiverStatus | null>(null);
  const events = ref<IGuardianEvent[]>([]);
  const stats = ref<IGuardianEventStats[]>([]);
  const timeline = ref<IGuardianTimelineBucket[]>([]);

  const isLoading = ref(false);
  const isLoadingEvents = ref(false);
  const error = ref<string | null>(null);

  // Filters
  const timeRange = ref<TimeRange>('24h');
  const filterEventType = ref<GuardianEventType | ''>('');
  const filterUsername = ref('');
  const filterSpaceName = ref('');
  const filterSeverity = ref('');

  // Pagination
  const limit = ref(100);
  const offset = ref(0);
  const hasMore = ref(false);

  // ── Computed ────────────────────────────────────
  const timeRangeParams = computed(() => {
    const now = Math.floor(Date.now() / 1000);
    return {
      from: now - TIME_RANGE_SECONDS[timeRange.value],
      to: now,
    };
  });

  const totalEvents = computed(() => {
    return stats.value.reduce((sum, s) => sum + s.count, 0);
  });

  // ── Actions ────────────────────────────────────

  async function fetchStatus(): Promise<void> {
    try {
      const response = await api.get<{ data: IGuardianReceiverStatus }>('/api/v1/guardian/status');
      status.value = response.data.data;
    } catch (err) {
      console.error('Guardian status fetch failed:', err);
    }
  }

  async function fetchStats(): Promise<void> {
    try {
      const { from, to } = timeRangeParams.value;
      const response = await api.get<{ data: IGuardianEventStats[] }>('/api/v1/guardian/stats', {
        params: { from, to },
      });
      stats.value = response.data.data;
    } catch (err) {
      console.error('Guardian stats fetch failed:', err);
    }
  }

  async function fetchTimeline(): Promise<void> {
    try {
      const { from, to } = timeRangeParams.value;
      const buckets = timeRange.value === '1h' ? 12 : timeRange.value === '6h' ? 18 : 24;
      const response = await api.get<{ data: IGuardianTimelineBucket[] }>('/api/v1/guardian/timeline', {
        params: { from, to, buckets },
      });
      timeline.value = response.data.data;
    } catch (err) {
      console.error('Guardian timeline fetch failed:', err);
    }
  }

  async function fetchEvents(append = false): Promise<void> {
    isLoadingEvents.value = true;
    error.value = null;

    try {
      const { from, to } = timeRangeParams.value;
      const params: Record<string, string | number> = {
        from,
        to,
        limit: limit.value,
        offset: append ? offset.value : 0,
      };

      if (filterEventType.value) params.eventType = filterEventType.value;
      if (filterUsername.value) params.username = filterUsername.value;
      if (filterSpaceName.value) params.spaceName = filterSpaceName.value;

      const response = await api.get<{ data: IGuardianEvent[] }>('/api/v1/guardian/events', { params });
      const newEvents = response.data.data;

      if (append) {
        events.value = [...events.value, ...newEvents];
      } else {
        events.value = newEvents;
        offset.value = 0;
      }

      hasMore.value = newEvents.length === limit.value;
      if (!append) offset.value = newEvents.length;
      else offset.value += newEvents.length;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch events';
    } finally {
      isLoadingEvents.value = false;
    }
  }

  async function fetchAll(): Promise<void> {
    isLoading.value = true;
    error.value = null;

    try {
      await Promise.all([
        fetchStatus(),
        fetchStats(),
        fetchTimeline(),
        fetchEvents(),
      ]);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch Guardian data';
    } finally {
      isLoading.value = false;
    }
  }

  /** Refresh stats + status + timeline (lightweight, for auto-refresh) */
  async function refreshOverview(): Promise<void> {
    await Promise.all([
      fetchStatus(),
      fetchStats(),
      fetchTimeline(),
    ]);
  }

  function loadMore(): void {
    fetchEvents(true);
  }

  function setTimeRange(range: TimeRange): void {
    timeRange.value = range;
    offset.value = 0;
    fetchAll();
  }

  function applyFilters(): void {
    offset.value = 0;
    fetchEvents();
  }

  function clearFilters(): void {
    filterEventType.value = '';
    filterUsername.value = '';
    filterSpaceName.value = '';
    filterSeverity.value = '';
    offset.value = 0;
    fetchEvents();
  }

  return {
    // State
    status,
    events,
    stats,
    timeline,
    isLoading,
    isLoadingEvents,
    error,
    timeRange,
    filterEventType,
    filterUsername,
    filterSpaceName,
    filterSeverity,
    hasMore,
    // Computed
    totalEvents,
    // Actions
    fetchAll,
    refreshOverview,
    fetchEvents,
    loadMore,
    setTimeRange,
    applyFilters,
    clearFilters,
  };
});
