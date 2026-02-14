<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import { useAssetCatalogStore } from '@/stores/asset-catalog.store';
import { useNotification } from '@/composables/useNotification';
import type { IAsset } from '@shared/types';

interface Props {
  asset: IAsset;
}

interface Emits {
  (e: 'close'): void;
  (e: 'delete'): void;
  (e: 'restored'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const catalogStore = useAssetCatalogStore();
const { success: showSuccess, error: showError } = useNotification();
const isRestoring = ref(false);

const authToken = computed(() => localStorage.getItem('es_token') || '');

// ── Media preview ────────────────────────────
const videoElement = ref<HTMLVideoElement | null>(null);
let player: ReturnType<typeof videojs> | null = null;

const canPreview = computed(() => {
  const t = props.asset.assetType;
  return t === 'video' || t === 'audio' || t === 'image' || t === 'avid_mxf' || t === 'sequence';
});

const proxyMimeType = computed(() => {
  if (props.asset.assetType === 'audio') return 'audio/mpeg';
  return 'video/mp4';
});

function initPlayer() {
  nextTick(() => {
    if (videoElement.value && !player) {
      player = videojs(videoElement.value, {
        fluid: true,
        responsive: true,
      });
    }
  });
}

function disposePlayer() {
  if (player) {
    player.dispose();
    player = null;
  }
}

onMounted(() => {
  if (props.asset.proxyStatus === 'ready' && props.asset.proxyPath) {
    initPlayer();
  }
});

onBeforeUnmount(() => {
  disposePlayer();
});

// Re-init player if asset changes (e.g. proxy becomes ready)
watch(() => props.asset.proxyStatus, (status) => {
  if (status === 'ready' && props.asset.proxyPath) {
    disposePlayer();
    initPlayer();
  }
});

// ── Formatting ────────────────────────────────
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString();
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fileTypeIcon(type: string): string {
  switch (type) {
    case 'video': return 'mdi-movie';
    case 'audio': return 'mdi-music';
    case 'image': return 'mdi-image';
    case 'sidecar': return 'mdi-file-document-outline';
    case 'metadata': return 'mdi-code-json';
    default: return 'mdi-file';
  }
}

function roleColor(role: string): string {
  switch (role) {
    case 'primary': return 'primary';
    case 'component': return 'info';
    case 'sidecar': return 'grey';
    default: return 'grey';
  }
}

function assetTypeColor(type: string): string {
  switch (type) {
    case 'video': return 'blue';
    case 'audio': return 'green';
    case 'image': return 'orange';
    case 'avid_mxf': return 'purple';
    case 'sequence': return 'teal';
    default: return 'grey';
  }
}

// ── Archive helpers ────────────────────────────

function archiveStatusColor(status?: string): string {
  switch (status) {
    case 'archived': return 'deep-purple';
    case 'partial': return 'warning';
    default: return 'success';
  }
}

const hasArchivedFiles = computed(() =>
  props.asset.archiveStatus === 'archived' || props.asset.archiveStatus === 'partial',
);

async function handleRestore(): Promise<void> {
  isRestoring.value = true;
  try {
    const result = await catalogStore.restoreAsset(props.asset.id);
    if (result) {
      if (result.failed.length === 0) {
        showSuccess(`Restored ${result.restored.length} file(s) successfully`);
      } else {
        showSuccess(`Restored ${result.restored.length} file(s), ${result.failed.length} failed`);
      }
      emit('restored');
    } else {
      showError(catalogStore.error || 'Restore failed');
    }
  } finally {
    isRestoring.value = false;
  }
}

// ── Computed metadata sections ────────────────
const meta = computed(() => props.asset.metadata);

const technicalMeta = computed(() => {
  const m = meta.value;
  if (!m) return [];
  const items: { label: string; value: string }[] = [];
  if (m.codec) items.push({ label: 'Codec', value: `${m.codec}${m.codecProfile ? ` (${m.codecProfile})` : ''}` });
  if (m.width && m.height) items.push({ label: 'Resolution', value: `${m.width} × ${m.height}` });
  if (m.frameRate) items.push({ label: 'Frame Rate', value: `${m.frameRate} fps` });
  if (m.aspectRatio) items.push({ label: 'Aspect Ratio', value: m.aspectRatio });
  if (m.duration) items.push({ label: 'Duration', value: formatDuration(m.duration) });
  if (m.bitrate) items.push({ label: 'Bitrate', value: `${(m.bitrate / 1_000_000).toFixed(1)} Mbps` });
  if (m.pixelFormat) items.push({ label: 'Pixel Format', value: m.pixelFormat });
  if (m.containerFormat) items.push({ label: 'Container', value: m.containerFormat });
  if (m.sampleRate) items.push({ label: 'Sample Rate', value: `${m.sampleRate} Hz` });
  if (m.audioChannels) items.push({ label: 'Audio Channels', value: String(m.audioChannels) });
  return items;
});

const cameraMeta = computed(() => {
  const m = meta.value;
  if (!m) return [];
  const items: { label: string; value: string }[] = [];
  if (m.cameraMake) items.push({ label: 'Make', value: m.cameraMake });
  if (m.cameraModel) items.push({ label: 'Model', value: m.cameraModel });
  if (m.cameraSerial) items.push({ label: 'Serial', value: m.cameraSerial });
  if (m.lensInfo) items.push({ label: 'Lens', value: m.lensInfo });
  if (m.focalLength) items.push({ label: 'Focal Length', value: m.focalLength });
  if (m.aperture) items.push({ label: 'Aperture', value: m.aperture });
  if (m.iso) items.push({ label: 'ISO', value: String(m.iso) });
  if (m.shutterSpeed) items.push({ label: 'Shutter Speed', value: m.shutterSpeed });
  if (m.dateTimeOriginal) items.push({ label: 'Date Original', value: m.dateTimeOriginal });
  if (m.colorSpace) items.push({ label: 'Color Space', value: m.colorSpace });
  if (m.whiteBalance) items.push({ label: 'White Balance', value: m.whiteBalance });
  return items;
});

const cardStructureMeta = computed(() => {
  const cs = meta.value?.cardStructure;
  if (!cs) return null;
  return cs;
});

const mxfMeta = computed(() => {
  const m = meta.value;
  if (!m) return [];
  const items: { label: string; value: string }[] = [];
  if (m.umid) items.push({ label: 'UMID', value: m.umid });
  if (m.timecodeStart) items.push({ label: 'Timecode Start', value: m.timecodeStart });
  return items;
});
</script>

<template>
  <v-card class="asset-detail">
    <v-card-title class="d-flex align-center ga-2">
      <v-chip :color="assetTypeColor(asset.assetType)" size="small" variant="tonal">
        {{ asset.assetType }}
      </v-chip>
      <span class="text-h6">{{ asset.name }}</span>
      <v-spacer />
      <v-btn icon="mdi-close" variant="text" size="small" @click="emit('close')" />
    </v-card-title>

    <v-divider />

    <v-card-text class="asset-detail__body">
      <!-- Summary -->
      <div class="asset-detail__summary">
        <div class="asset-detail__summary-item">
          <span class="text-caption text-medium-emphasis">Space</span>
          <span>{{ asset.spaceName }}</span>
        </div>
        <div class="asset-detail__summary-item">
          <span class="text-caption text-medium-emphasis">Directory</span>
          <span class="text-caption">{{ asset.directoryPath }}</span>
        </div>
        <div class="asset-detail__summary-item">
          <span class="text-caption text-medium-emphasis">Files</span>
          <span>{{ asset.fileCount }}</span>
        </div>
        <div class="asset-detail__summary-item">
          <span class="text-caption text-medium-emphasis">Total Size</span>
          <span>{{ formatSize(asset.totalSize) }}</span>
        </div>
        <div class="asset-detail__summary-item">
          <span class="text-caption text-medium-emphasis">First Seen</span>
          <span>{{ formatDate(asset.firstSeenAt) }}</span>
        </div>
        <div class="asset-detail__summary-item">
          <span class="text-caption text-medium-emphasis">Last Scanned</span>
          <span>{{ formatDate(asset.lastScannedAt) }}</span>
        </div>
      </div>

      <!-- Media Preview -->
      <div v-if="canPreview" class="asset-detail__preview">
        <!-- Video/Audio Player -->
        <div v-if="asset.proxyStatus === 'ready' && asset.proxyPath" class="asset-detail__player-container">
          <video
            ref="videoElement"
            class="video-js vjs-theme-city"
            controls
            preload="metadata"
          >
            <source :src="`/api/v1/catalog/assets/${asset.id}/proxy?token=${authToken}`" :type="proxyMimeType" />
          </video>
        </div>
        <!-- Thumbnail only (no proxy) -->
        <div v-else-if="asset.thumbnailPath" class="asset-detail__thumbnail-preview">
          <img :src="`/api/v1/catalog/assets/${asset.id}/thumbnail?token=${authToken}`" />
        </div>
        <!-- Proxy generation status -->
        <div v-else-if="asset.proxyStatus === 'generating' || asset.proxyStatus === 'queued'" class="asset-detail__proxy-status">
          <v-progress-circular indeterminate size="24" width="2" />
          <span class="text-caption ml-2">{{ asset.proxyStatus === 'generating' ? 'Generating proxy...' : 'Queued for proxy generation' }}</span>
        </div>
      </div>

      <!-- Archive Status -->
      <div v-if="hasArchivedFiles" class="asset-detail__archive-status">
        <div class="d-flex align-center ga-2">
          <v-chip :color="archiveStatusColor(asset.archiveStatus)" size="small" variant="tonal">
            <v-icon start size="14">mdi-archive</v-icon>
            {{ asset.archiveStatus === 'archived' ? 'Fully Archived' : 'Partially Archived' }}
          </v-chip>
          <v-spacer />
          <v-btn
            color="success"
            size="small"
            variant="outlined"
            :loading="isRestoring"
            prepend-icon="mdi-restore"
            @click="handleRestore"
          >
            Restore
          </v-btn>
        </div>
        <div class="text-caption mt-1" style="color: #6b7280;">
          {{ asset.files?.filter(f => f.isArchiveStub).length }} of {{ asset.files?.length }} file(s) archived — restore will use highest-priority location
        </div>
      </div>

      <!-- Technical Metadata -->
      <div v-if="technicalMeta.length > 0" class="asset-detail__section">
        <h4 class="asset-detail__section-title">
          <v-icon size="small" class="mr-1">mdi-information</v-icon>
          Technical
        </h4>
        <div class="asset-detail__meta-grid">
          <div v-for="item in technicalMeta" :key="item.label" class="asset-detail__meta-item">
            <span class="text-caption text-medium-emphasis">{{ item.label }}</span>
            <span>{{ item.value }}</span>
          </div>
        </div>
      </div>

      <!-- Camera Metadata -->
      <div v-if="cameraMeta.length > 0" class="asset-detail__section">
        <h4 class="asset-detail__section-title">
          <v-icon size="small" class="mr-1">mdi-camera</v-icon>
          Camera
        </h4>
        <div class="asset-detail__meta-grid">
          <div v-for="item in cameraMeta" :key="item.label" class="asset-detail__meta-item">
            <span class="text-caption text-medium-emphasis">{{ item.label }}</span>
            <span>{{ item.value }}</span>
          </div>
        </div>
      </div>

      <!-- MXF Metadata -->
      <div v-if="mxfMeta.length > 0" class="asset-detail__section">
        <h4 class="asset-detail__section-title">
          <v-icon size="small" class="mr-1">mdi-filmstrip</v-icon>
          MXF
        </h4>
        <div class="asset-detail__meta-grid">
          <div v-for="item in mxfMeta" :key="item.label" class="asset-detail__meta-item">
            <span class="text-caption text-medium-emphasis">{{ item.label }}</span>
            <span class="text-caption" style="word-break: break-all">{{ item.value }}</span>
          </div>
        </div>
      </div>

      <!-- Card Structure -->
      <div v-if="cardStructureMeta" class="asset-detail__section">
        <h4 class="asset-detail__section-title">
          <v-icon size="small" class="mr-1">mdi-sd</v-icon>
          Card Structure
        </h4>
        <div class="asset-detail__meta-grid">
          <div class="asset-detail__meta-item">
            <span class="text-caption text-medium-emphasis">Type</span>
            <v-chip size="x-small" color="teal" variant="tonal">{{ cardStructureMeta.type }}</v-chip>
          </div>
          <div v-if="cardStructureMeta.cardName" class="asset-detail__meta-item">
            <span class="text-caption text-medium-emphasis">Card</span>
            <span>{{ cardStructureMeta.cardName }}</span>
          </div>
          <div v-if="cardStructureMeta.clipId" class="asset-detail__meta-item">
            <span class="text-caption text-medium-emphasis">Clip ID</span>
            <span>{{ cardStructureMeta.clipId }}</span>
          </div>
        </div>
      </div>

      <!-- Files -->
      <div class="asset-detail__section">
        <h4 class="asset-detail__section-title">
          <v-icon size="small" class="mr-1">mdi-file-multiple</v-icon>
          Files ({{ asset.files?.length ?? 0 }})
        </h4>
        <v-table density="compact" class="asset-detail__files-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Type</th>
              <th>Role</th>
              <th>Size</th>
              <th>Checksum</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="file in asset.files" :key="file.id">
              <td>
                <div class="d-flex align-center ga-1">
                  <v-icon :icon="fileTypeIcon(file.fileType)" size="x-small" />
                  <span class="text-caption">{{ file.fileName }}</span>
                  <v-icon v-if="file.isArchiveStub" icon="mdi-archive" size="x-small" color="deep-purple" />
                </div>
              </td>
              <td>
                <v-chip size="x-small" variant="tonal">{{ file.fileType }}</v-chip>
              </td>
              <td>
                <v-chip :color="roleColor(file.role)" size="x-small" variant="tonal">{{ file.role }}</v-chip>
              </td>
              <td class="text-no-wrap">{{ formatSize(file.fileSize) }}</td>
              <td>
                <span v-if="file.checksum" class="text-caption text-medium-emphasis" style="word-break: break-all">
                  {{ file.checksum.substring(0, 24) }}...
                </span>
                <span v-else class="text-caption text-medium-emphasis">—</span>
              </td>
            </tr>
          </tbody>
        </v-table>
      </div>
    </v-card-text>

    <v-divider />

    <v-card-actions>
      <v-btn
        color="error"
        variant="text"
        size="small"
        prepend-icon="mdi-delete"
        @click="emit('delete')"
      >
        Remove from catalog
      </v-btn>
      <v-spacer />
      <v-btn variant="text" @click="emit('close')">Close</v-btn>
    </v-card-actions>
  </v-card>
</template>

<style scoped lang="scss">
.asset-detail {
  background-color: #1e2128 !important;

  &__body {
    max-height: 60vh;
    overflow-y: auto;
  }

  &__summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    padding-bottom: 16px;
    border-bottom: 1px solid rgba(55, 65, 81, 0.3);
    margin-bottom: 16px;
  }

  &__summary-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__preview {
    margin-bottom: 16px;
    border-radius: 8px;
    overflow: hidden;
    background: #1a1c22;
  }

  &__player-container {
    .video-js {
      width: 100%;
      border-radius: 8px;
    }
  }

  &__thumbnail-preview img {
    width: 100%;
    max-height: 300px;
    object-fit: contain;
    display: block;
  }

  &__proxy-status {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
  }

  &__archive-status {
    background: rgba(103, 58, 183, 0.08);
    border: 1px solid rgba(103, 58, 183, 0.2);
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 16px;
  }

  &__section {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid rgba(55, 65, 81, 0.15);

    &:last-child {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }
  }

  &__section-title {
    font-size: 13px;
    font-weight: 600;
    color: #9ca3af;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
  }

  &__meta-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  &__meta-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__files-table {
    :deep(table) {
      background-color: transparent !important;
    }
  }
}
</style>
