<script setup lang="ts">
import { computed } from 'vue';
import type { IFileEntry, IFileAcl, IDirInfo } from '@shared/types';

interface Props {
  entry: IFileEntry | null;
  acl: IFileAcl | null;
  goal: string | null;
  dirInfo: IDirInfo | null;
  isLoading: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
  'edit-acl': [];
  'edit-goal': [];
  download: [path: string];
  'restore-archive': [catalogEntryId: number];
}>();

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(ts: number): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString();
}

function formatMode(mode: number): string {
  const octal = (mode & 0o7777).toString(8).padStart(4, '0');
  return octal;
}

const aclSummary = computed(() => {
  if (!props.acl) return [];
  return props.acl.entries.filter((e) => !e.isDefault).map((e) => {
    const perms = [
      e.read ? 'r' : '-',
      e.write ? 'w' : '-',
      e.execute ? 'x' : '-',
      e.admin ? 'a' : '',
    ].join('');
    const prefix = e.type === 'user' ? 'u' : e.type === 'group' ? 'g' : e.type;
    const qualifier = e.qualifier || '(owner)';
    return `${prefix}:${qualifier}:${perms}`;
  });
});

const defaultAclSummary = computed(() => {
  if (!props.acl) return [];
  return props.acl.entries.filter((e) => e.isDefault).map((e) => {
    const perms = [
      e.read ? 'r' : '-',
      e.write ? 'w' : '-',
      e.execute ? 'x' : '-',
      e.admin ? 'a' : '',
    ].join('');
    const prefix = e.type === 'user' ? 'u' : e.type === 'group' ? 'g' : e.type;
    const qualifier = e.qualifier || '(owner)';
    return `${prefix}:${qualifier}:${perms}`;
  });
});
</script>

<template>
  <div class="file-detail-panel" v-if="entry">
    <div class="file-detail-panel__header">
      <v-icon size="20" class="mr-2">
        {{ entry.type === 'directory' ? 'mdi-folder' : 'mdi-file' }}
      </v-icon>
      <span class="file-detail-panel__name">{{ entry.name }}</span>
      <v-spacer />
      <v-btn icon="mdi-close" size="x-small" variant="text" @click="emit('close')" />
    </div>

    <v-progress-linear v-if="isLoading" indeterminate color="primary" class="mb-2" />

    <div class="file-detail-panel__body">
      <!-- Basic info -->
      <div class="file-detail-panel__section">
        <div class="file-detail-panel__section-title">Properties</div>
        <div class="file-detail-panel__row">
          <span class="file-detail-panel__label">Type</span>
          <span>{{ entry.type === 'directory' ? 'Directory' : 'File' }}</span>
        </div>
        <div class="file-detail-panel__row">
          <span class="file-detail-panel__label">Size</span>
          <span>{{ formatBytes(entry.size) }}</span>
        </div>
        <div class="file-detail-panel__row">
          <span class="file-detail-panel__label">Modified</span>
          <span>{{ formatDate(entry.mtime) }}</span>
        </div>
        <div class="file-detail-panel__row">
          <span class="file-detail-panel__label">Accessed</span>
          <span>{{ formatDate(entry.atime) }}</span>
        </div>
        <div class="file-detail-panel__row">
          <span class="file-detail-panel__label">Owner</span>
          <span>{{ entry.owner }}:{{ entry.group }}</span>
        </div>
        <div class="file-detail-panel__row">
          <span class="file-detail-panel__label">Mode</span>
          <span class="font-mono">{{ formatMode(entry.mode) }}</span>
        </div>
        <div class="file-detail-panel__row">
          <span class="file-detail-panel__label">Inode</span>
          <span>{{ entry.inode }}</span>
        </div>
      </div>

      <!-- Dir info -->
      <div v-if="dirInfo" class="file-detail-panel__section">
        <div class="file-detail-panel__section-title">Directory Info</div>
        <div class="file-detail-panel__row">
          <span class="file-detail-panel__label">Files</span>
          <span>{{ dirInfo.files }}</span>
        </div>
        <div class="file-detail-panel__row">
          <span class="file-detail-panel__label">Directories</span>
          <span>{{ dirInfo.directories }}</span>
        </div>
        <div class="file-detail-panel__row">
          <span class="file-detail-panel__label">Logical size</span>
          <span>{{ formatBytes(dirInfo.length) }}</span>
        </div>
        <div class="file-detail-panel__row">
          <span class="file-detail-panel__label">Physical size</span>
          <span>{{ formatBytes(dirInfo.size) }}</span>
        </div>
        <div class="file-detail-panel__row">
          <span class="file-detail-panel__label">Chunks</span>
          <span>{{ dirInfo.chunks }}</span>
        </div>
      </div>

      <!-- Goal -->
      <div class="file-detail-panel__section">
        <div class="file-detail-panel__section-title">
          Storage Goal
          <v-btn
            size="x-small"
            variant="text"
            icon="mdi-pencil"
            class="ml-1"
            @click="emit('edit-goal')"
          />
        </div>
        <div v-if="goal" class="file-detail-panel__goal-chip">
          <v-chip size="small" variant="tonal" color="info" label>
            <v-icon start size="small">mdi-target</v-icon>
            {{ goal }}
          </v-chip>
        </div>
        <div v-else class="text-caption text-medium-emphasis">Not loaded</div>
      </div>

      <!-- ACL summary -->
      <div class="file-detail-panel__section">
        <div class="file-detail-panel__section-title">
          Access Control
          <v-btn
            size="x-small"
            variant="text"
            icon="mdi-pencil"
            class="ml-1"
            @click="emit('edit-acl')"
          />
        </div>
        <div v-if="acl">
          <div class="text-caption text-medium-emphasis mb-1">
            Owner: {{ acl.owner }}:{{ acl.group }}
          </div>
          <div v-for="(line, idx) in aclSummary" :key="idx" class="file-detail-panel__acl-line">
            {{ line }}
          </div>
          <div v-if="defaultAclSummary.length > 0" class="mt-2">
            <div class="text-caption text-medium-emphasis mb-1">Default ACLs:</div>
            <div
              v-for="(line, idx) in defaultAclSummary"
              :key="'d-' + idx"
              class="file-detail-panel__acl-line"
            >
              {{ line }}
            </div>
          </div>
        </div>
        <div v-else class="text-caption text-medium-emphasis">Not loaded</div>
      </div>

      <!-- Archive Info (for stubs) -->
      <div v-if="entry.isArchiveStub && entry.archiveInfo" class="file-detail-panel__section">
        <div class="file-detail-panel__section-title">
          <v-icon size="14" color="deep-purple" class="mr-1">mdi-archive</v-icon>
          Archive Info
        </div>
        <div class="file-detail-panel__row">
          <span class="file-detail-panel__label">Original Size</span>
          <span>{{ formatBytes(entry.archiveInfo.originalSize) }}</span>
        </div>
        <div class="file-detail-panel__row">
          <span class="file-detail-panel__label">Location</span>
          <span>{{ entry.archiveInfo.archiveLocationName }}</span>
        </div>
        <div class="file-detail-panel__row">
          <span class="file-detail-panel__label">Archived</span>
          <span>{{ formatDate(entry.archiveInfo.archivedAt) }}</span>
        </div>
        <v-btn
          size="small"
          variant="tonal"
          color="deep-purple"
          prepend-icon="mdi-archive-arrow-down"
          block
          class="mt-3"
          @click="emit('restore-archive', entry.archiveInfo!.catalogEntryId)"
        >
          Restore from Archive
        </v-btn>
      </div>

      <!-- Actions -->
      <div v-if="entry.type === 'file'" class="file-detail-panel__section">
        <v-btn
          v-if="!entry.isArchiveStub"
          size="small"
          variant="tonal"
          color="primary"
          prepend-icon="mdi-download"
          block
          @click="emit('download', entry.path)"
        >
          Download
        </v-btn>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.file-detail-panel {
  width: 300px;
  background-color: #1e2128;
  border-left: 1px solid rgba(55, 65, 81, 0.3);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;

  @include phone {
    width: 100%;
    border-left: none;
  }

  &__header {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(55, 65, 81, 0.3);
    min-height: 48px;
  }

  &__name {
    font-weight: 600;
    font-size: 14px;
    color: #e5e7eb;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__body {
    padding: 12px 16px;
    flex: 1;
  }

  &__section {
    margin-bottom: 16px;
  }

  &__section-title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9ca3af;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
  }

  &__row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 3px 0;
    font-size: 13px;
    color: #d1d5db;
  }

  &__label {
    color: #6b7280;
    flex-shrink: 0;
    margin-right: 12px;
  }

  &__acl-line {
    font-family: 'Roboto Mono', monospace;
    font-size: 12px;
    color: #d1d5db;
    padding: 1px 0;
  }

  &__goal-chip {
    margin-top: 4px;
  }
}

.font-mono {
  font-family: 'Roboto Mono', monospace;
}
</style>
