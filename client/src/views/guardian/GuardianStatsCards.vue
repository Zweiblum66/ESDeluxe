<script setup lang="ts">
import { computed } from 'vue';
import type { IGuardianEventStats } from '@shared/types/guardian';

const props = defineProps<{
  stats: IGuardianEventStats[];
}>();

const fileAuditCount = computed(() =>
  props.stats.find((s) => s.eventType === 'file_audit')?.count ?? 0,
);
const storageCount = computed(() =>
  props.stats.find((s) => s.eventType === 'storage')?.count ?? 0,
);
const systemCount = computed(() =>
  props.stats.find((s) => s.eventType === 'system')?.count ?? 0,
);
const totalCount = computed(() =>
  props.stats.reduce((sum, s) => sum + s.count, 0),
);

interface StatCard {
  label: string;
  count: number;
  icon: string;
  color: string;
}

const cards = computed<StatCard[]>(() => [
  { label: 'File Audit', count: fileAuditCount.value, icon: 'mdi-shield-check', color: '#3b82f6' },
  { label: 'Storage', count: storageCount.value, icon: 'mdi-database', color: '#22c55e' },
  { label: 'System', count: systemCount.value, icon: 'mdi-server', color: '#f59e0b' },
  { label: 'Total', count: totalCount.value, icon: 'mdi-chart-line', color: '#9ca3af' },
]);
</script>

<template>
  <div class="guardian-stats-cards">
    <v-card
      v-for="card in cards"
      :key="card.label"
      class="guardian-stats-cards__card"
    >
      <v-card-text class="d-flex align-center gap-3">
        <v-icon :color="card.color" size="36">{{ card.icon }}</v-icon>
        <div>
          <div class="text-caption text-medium-emphasis">{{ card.label }}</div>
          <div class="text-h5 font-weight-bold">{{ card.count.toLocaleString() }}</div>
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<style scoped lang="scss">
.guardian-stats-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;

  @media (max-width: 960px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }

  &__card {
    background-color: #22252d !important;
    border: 1px solid rgba(55, 65, 81, 0.3);
  }
}
</style>
