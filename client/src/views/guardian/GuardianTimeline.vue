<script setup lang="ts">
import { computed, ref } from 'vue';
import type { IGuardianTimelineBucket } from '@shared/types/guardian';

type EventCategory = 'file_audit' | 'storage' | 'system';

interface CategoryDef {
  key: EventCategory;
  label: string;
  color: string;
}

const categories: CategoryDef[] = [
  { key: 'file_audit', label: 'File Audit', color: '#3b82f6' },
  { key: 'storage', label: 'Storage', color: '#22c55e' },
  { key: 'system', label: 'System', color: '#f59e0b' },
];

const props = defineProps<{
  buckets: IGuardianTimelineBucket[];
}>();

const hoveredIndex = ref<number | null>(null);

// Visible event types — system hidden by default
const visibleTypes = ref<Set<EventCategory>>(new Set(['file_audit', 'storage']));

function toggleType(type: EventCategory): void {
  const s = new Set(visibleTypes.value);
  if (s.has(type)) {
    // Don't allow hiding all types
    if (s.size > 1) s.delete(type);
  } else {
    s.add(type);
  }
  visibleTypes.value = s;
}

function filteredTotal(b: IGuardianTimelineBucket): number {
  let total = 0;
  if (visibleTypes.value.has('file_audit')) total += b.file_audit;
  if (visibleTypes.value.has('storage')) total += b.storage;
  if (visibleTypes.value.has('system')) total += b.system;
  return total;
}

const maxCount = computed(() => {
  let max = 1;
  for (const b of props.buckets) {
    const total = filteredTotal(b);
    if (total > max) max = total;
  }
  return max;
});

/** Compute nice round Y-axis ticks (3-5 ticks including 0). */
const yTicks = computed(() => {
  const max = maxCount.value;
  if (max <= 1) return [0, 1];

  // Find a nice step: 1, 2, 5, 10, 20, 50, 100, ...
  const rawStep = max / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  let niceStep: number;
  if (residual <= 1.5) niceStep = 1 * magnitude;
  else if (residual <= 3) niceStep = 2 * magnitude;
  else if (residual <= 7) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;

  const niceMax = Math.ceil(max / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = 0; v <= niceMax; v += niceStep) {
    ticks.push(v);
  }
  return ticks;
});

/** The ceiling used for percentage calculation (top of the Y-axis). */
const scaleMax = computed(() => yTicks.value[yTicks.value.length - 1] || 1);

/** Total time span in seconds covered by all buckets. */
const timeSpanSeconds = computed(() => {
  const len = props.buckets.length;
  if (len < 2) return 0;
  return props.buckets[len - 1].bucket - props.buckets[0].bucket;
});

/**
 * Format a unix timestamp for the X-axis based on the total time span.
 * ≤ 24h  → "14:30"
 * ≤ 7d   → "Mon 14:00"
 * > 7d   → "Feb 10"
 */
function formatAxisLabel(ts: number): string {
  const d = new Date(ts * 1000);
  const span = timeSpanSeconds.value;

  if (span <= 86_400) {
    // Up to 24h — show time only
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (span <= 604_800) {
    // Up to 7d — show weekday + time
    const day = d.toLocaleDateString([], { weekday: 'short' });
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${day} ${time}`;
  }
  // More than 7d — show date only
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Format a unix timestamp for the tooltip (always shows full context).
 * ≤ 24h  → "14:30"
 * > 24h  → "Feb 10, 14:30"
 */
function formatTooltipTime(ts: number): string {
  const d = new Date(ts * 1000);
  const span = timeSpanSeconds.value;

  if (span <= 86_400) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

/** X-axis time labels — show ~5 evenly spaced labels. */
const xLabels = computed(() => {
  const len = props.buckets.length;
  if (len === 0) return [];

  const labelCount = Math.min(5, len);
  const step = Math.max(1, Math.floor((len - 1) / (labelCount - 1)));
  const labels: Array<{ idx: number; label: string }> = [];

  for (let i = 0; i < len; i += step) {
    labels.push({ idx: i, label: formatAxisLabel(props.buckets[i].bucket) });
  }
  // Always include the last bucket
  const lastIdx = len - 1;
  if (labels[labels.length - 1]?.idx !== lastIdx) {
    labels.push({ idx: lastIdx, label: formatAxisLabel(props.buckets[lastIdx].bucket) });
  }
  return labels;
});

function pct(value: number): number {
  return (value / scaleMax.value) * 100;
}

function formatTick(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}k`;
  return String(value);
}
</script>

<template>
  <v-card class="guardian-timeline">
    <v-card-text>
      <div class="guardian-timeline__title text-caption text-medium-emphasis mb-3">
        Event Activity
      </div>

      <div class="guardian-timeline__chart-wrapper">
        <!-- Y-axis labels -->
        <div class="guardian-timeline__y-axis">
          <span
            v-for="tick in [...yTicks].reverse()"
            :key="tick"
            class="guardian-timeline__y-label"
          >
            {{ formatTick(tick) }}
          </span>
        </div>

        <!-- Chart area -->
        <div class="guardian-timeline__chart-area">
          <!-- Horizontal grid lines -->
          <div
            v-for="tick in yTicks"
            :key="'grid-' + tick"
            class="guardian-timeline__grid-line"
            :style="{ bottom: `${pct(tick)}%` }"
          />

          <!-- Bars -->
          <div class="guardian-timeline__chart">
            <div
              v-for="(bucket, idx) in buckets"
              :key="idx"
              class="guardian-timeline__bar-group"
              @mouseenter="hoveredIndex = idx"
              @mouseleave="hoveredIndex = null"
            >
              <div class="guardian-timeline__bar-stack" :style="{ height: `${pct(filteredTotal(bucket))}%` }">
                <div
                  v-if="visibleTypes.has('file_audit') && bucket.file_audit > 0"
                  class="guardian-timeline__segment guardian-timeline__segment--file-audit"
                  :style="{ flex: bucket.file_audit }"
                />
                <div
                  v-if="visibleTypes.has('storage') && bucket.storage > 0"
                  class="guardian-timeline__segment guardian-timeline__segment--storage"
                  :style="{ flex: bucket.storage }"
                />
                <div
                  v-if="visibleTypes.has('system') && bucket.system > 0"
                  class="guardian-timeline__segment guardian-timeline__segment--system"
                  :style="{ flex: bucket.system }"
                />
              </div>

              <!-- Tooltip -->
              <div
                v-if="hoveredIndex === idx"
                class="guardian-timeline__tooltip"
              >
                <div class="font-weight-medium">{{ formatTooltipTime(bucket.bucket) }}</div>
                <template v-for="cat in categories" :key="cat.key">
                  <div v-if="visibleTypes.has(cat.key)" class="d-flex align-center gap-1">
                    <span class="guardian-timeline__legend" :class="`guardian-timeline__legend--${cat.key}`" />
                    {{ cat.label }}: {{ bucket[cat.key] }}
                  </div>
                </template>
                <div class="guardian-timeline__tooltip-total">
                  Total: {{ filteredTotal(bucket) }}
                </div>
              </div>
            </div>
          </div>

          <!-- X-axis time labels -->
          <div class="guardian-timeline__x-axis">
            <span
              v-for="lbl in xLabels"
              :key="lbl.idx"
              class="guardian-timeline__x-label"
              :style="{ left: `${(lbl.idx / (buckets.length - 1 || 1)) * 100}%` }"
            >
              {{ lbl.label }}
            </span>
          </div>
        </div>
      </div>

      <!-- Legend / Filters -->
      <div class="guardian-timeline__legends d-flex gap-3 mt-3">
        <button
          v-for="cat in categories"
          :key="cat.key"
          class="guardian-timeline__filter-btn"
          :class="{ 'guardian-timeline__filter-btn--inactive': !visibleTypes.has(cat.key) }"
          @click="toggleType(cat.key)"
        >
          <span
            class="guardian-timeline__legend"
            :style="{ backgroundColor: visibleTypes.has(cat.key) ? cat.color : '#4b5563' }"
          />
          {{ cat.label }}
        </button>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped lang="scss">
.guardian-timeline {
  background-color: #22252d !important;
  border: 1px solid rgba(55, 65, 81, 0.3);

  &__chart-wrapper {
    display: flex;
    gap: 0;
  }

  &__y-axis {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: flex-end;
    height: 120px;
    padding-right: 8px;
    flex-shrink: 0;
    min-width: 32px;
  }

  &__y-label {
    font-size: 10px;
    color: #6b7280;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  &__chart-area {
    flex: 1;
    position: relative;
    min-width: 0;
  }

  &__grid-line {
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
    background-color: rgba(55, 65, 81, 0.25);
    pointer-events: none;
    z-index: 0;
  }

  &__chart {
    display: flex;
    align-items: flex-end;
    height: 120px;
    gap: 2px;
    position: relative;
    z-index: 1;
  }

  &__bar-group {
    flex: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    position: relative;
    cursor: pointer;
    min-width: 4px;

    &:hover .guardian-timeline__bar-stack {
      opacity: 0.85;
    }
  }

  &__bar-stack {
    display: flex;
    flex-direction: column;
    border-radius: 2px 2px 0 0;
    overflow: hidden;
    min-height: 2px;
    transition: height 300ms ease, opacity 150ms ease;
  }

  &__segment {
    min-height: 1px;

    &--file-audit {
      background-color: #3b82f6;
    }

    &--storage {
      background-color: #22c55e;
    }

    &--system {
      background-color: #f59e0b;
    }
  }

  &__x-axis {
    position: relative;
    height: 20px;
    margin-top: 4px;
  }

  &__x-label {
    position: absolute;
    transform: translateX(-50%);
    font-size: 10px;
    color: #6b7280;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  &__tooltip {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    background-color: #1a1d23;
    border: 1px solid rgba(55, 65, 81, 0.6);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 12px;
    white-space: nowrap;
    z-index: 10;
    pointer-events: none;
    color: #e5e7eb;
    margin-bottom: 4px;
  }

  &__tooltip-total {
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px solid rgba(55, 65, 81, 0.5);
    font-weight: 500;
    color: #9ca3af;
    font-size: 11px;
  }

  &__filter-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px 3px 6px;
    border: 1px solid rgba(55, 65, 81, 0.4);
    border-radius: 12px;
    background: transparent;
    color: #e5e7eb;
    font-size: 12px;
    cursor: pointer;
    transition: all 150ms ease;
    line-height: 1;

    &:hover {
      border-color: rgba(55, 65, 81, 0.7);
      background-color: rgba(255, 255, 255, 0.04);
    }

    &--inactive {
      color: #6b7280;
      opacity: 0.6;

      &:hover {
        opacity: 0.85;
      }
    }
  }

  &__legend {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    flex-shrink: 0;

    &--file-audit {
      background-color: #3b82f6;
    }

    &--storage {
      background-color: #22c55e;
    }

    &--system {
      background-color: #f59e0b;
    }
  }
}
</style>
