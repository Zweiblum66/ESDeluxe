<script setup lang="ts">
import { ref } from 'vue';

interface Props {
  modelValue: boolean;
  currentPath: string;
  isUploading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isUploading: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  upload: [files: File[]];
}>();

const selectedFiles = ref<File[]>([]);
const isDragging = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

function handleDrop(event: DragEvent): void {
  isDragging.value = false;
  if (!event.dataTransfer?.files.length) return;
  addFiles(Array.from(event.dataTransfer.files));
}

function handleFileInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (!input.files?.length) return;
  addFiles(Array.from(input.files));
  input.value = '';
}

function addFiles(files: File[]): void {
  // Deduplicate by name
  const existingNames = new Set(selectedFiles.value.map((f) => f.name));
  for (const file of files) {
    if (!existingNames.has(file.name)) {
      selectedFiles.value.push(file);
      existingNames.add(file.name);
    }
  }
}

function removeFile(index: number): void {
  selectedFiles.value.splice(index, 1);
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(1)) + ' ' + sizes[i];
}

function handleUpload(): void {
  if (selectedFiles.value.length === 0) return;
  emit('upload', [...selectedFiles.value]);
}

function handleClose(): void {
  selectedFiles.value = [];
  emit('update:modelValue', false);
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="600"
    @update:model-value="handleClose"
  >
    <v-card>
      <v-card-title>
        Upload Files
        <span v-if="currentPath" class="text-caption text-medium-emphasis ml-2">
          to {{ currentPath || '/' }}
        </span>
      </v-card-title>

      <v-card-text>
        <!-- Drop zone -->
        <div
          class="upload-dropzone"
          :class="{ 'upload-dropzone--active': isDragging }"
          @dragover.prevent="isDragging = true"
          @dragleave="isDragging = false"
          @drop.prevent="handleDrop"
          @click="fileInputRef?.click()"
        >
          <v-icon size="48" color="primary" class="mb-2">
            {{ isDragging ? 'mdi-cloud-upload' : 'mdi-file-upload-outline' }}
          </v-icon>
          <div class="text-body-1">
            {{ isDragging ? 'Drop files here' : 'Drag & drop files or click to browse' }}
          </div>
          <div class="text-caption text-medium-emphasis mt-1">
            Supports multiple files
          </div>
        </div>

        <input
          ref="fileInputRef"
          type="file"
          multiple
          style="display: none"
          @change="handleFileInput"
        />

        <!-- File list -->
        <div v-if="selectedFiles.length > 0" class="upload-file-list mt-4">
          <div class="text-subtitle-2 mb-2">
            {{ selectedFiles.length }} file(s) selected
          </div>
          <v-list density="compact" class="upload-file-list__items">
            <v-list-item
              v-for="(file, index) in selectedFiles"
              :key="file.name"
              :title="file.name"
              :subtitle="formatSize(file.size)"
            >
              <template #prepend>
                <v-icon size="small">mdi-file</v-icon>
              </template>
              <template #append>
                <v-btn
                  icon="mdi-close"
                  size="x-small"
                  variant="text"
                  @click.stop="removeFile(index)"
                />
              </template>
            </v-list-item>
          </v-list>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn @click="handleClose" :disabled="props.isUploading">Cancel</v-btn>
        <v-btn
          color="primary"
          :loading="props.isUploading"
          :disabled="selectedFiles.length === 0"
          @click="handleUpload"
        >
          Upload {{ selectedFiles.length > 0 ? `(${selectedFiles.length})` : '' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.upload-dropzone {
  border: 2px dashed rgba(55, 65, 81, 0.5);
  border-radius: 12px;
  padding: 40px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 200ms ease;

  &:hover {
    border-color: rgba(59, 130, 246, 0.4);
    background-color: rgba(59, 130, 246, 0.04);
  }

  &--active {
    border-color: #3b82f6;
    background-color: rgba(59, 130, 246, 0.08);
  }
}

.upload-file-list {
  &__items {
    max-height: 240px;
    overflow-y: auto;
    background: transparent !important;
  }
}
</style>
