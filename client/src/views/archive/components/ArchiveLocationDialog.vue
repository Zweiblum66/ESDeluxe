<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useArchiveStore } from '@/stores/archive.store';
import type {
  IArchiveLocation,
  ICreateArchiveLocationRequest,
  IUpdateArchiveLocationRequest,
  ISmbArchiveConfig,
  IS3ArchiveConfig,
} from '@shared/types';

const props = defineProps<{
  modelValue: boolean;
  editLocation?: IArchiveLocation | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [];
}>();

const store = useArchiveStore();

const form = ref({
  name: '',
  type: 'local' as 'local' | 'smb' | 's3' | 'tape',
  // Local fields
  basePath: '',
  // SMB fields
  sharePath: '',
  smbUsername: '',
  smbPassword: '',
  smbDomain: '',
  mountOptions: '',
  // S3 fields
  s3Bucket: '',
  s3Region: '',
  s3Prefix: '',
  s3Endpoint: '',
  s3AccessKeyId: '',
  s3SecretAccessKey: '',
  // Common
  description: '',
  priority: 50,
});

const isSaving = ref(false);
const testResult = ref<{ ok: boolean; message: string } | null>(null);
const isTesting = ref(false);

const isEdit = computed(() => !!props.editLocation);
const dialogTitle = computed(() => isEdit.value ? 'Edit Archive Location' : 'Add Archive Location');

const isValid = computed(() => {
  if (!form.value.name.trim()) return false;
  if (form.value.type === 'local' && !form.value.basePath.trim()) return false;
  if (form.value.type === 'smb') {
    if (!form.value.sharePath.trim()) return false;
    if (!form.value.smbUsername.trim()) return false;
    // Password required for new locations; optional for edit (masked with ********)
    if (!isEdit.value && !form.value.smbPassword) return false;
  }
  if (form.value.type === 's3') {
    if (!form.value.s3Bucket.trim()) return false;
    if (!form.value.s3Region.trim()) return false;
    if (!form.value.s3AccessKeyId.trim()) return false;
    // Secret required for new locations; optional for edit (masked)
    if (!isEdit.value && !form.value.s3SecretAccessKey) return false;
  }
  return true;
});

watch(() => props.modelValue, (visible) => {
  if (visible) {
    testResult.value = null;
    if (props.editLocation) {
      form.value.name = props.editLocation.name;
      form.value.type = props.editLocation.type as typeof form.value.type;
      form.value.description = props.editLocation.description || '';
      form.value.priority = props.editLocation.priority ?? 50;

      if (props.editLocation.type === 'local') {
        form.value.basePath = (props.editLocation.config as { basePath?: string }).basePath || '';
        // Clear SMB fields
        form.value.sharePath = '';
        form.value.smbUsername = '';
        form.value.smbPassword = '';
        form.value.smbDomain = '';
        form.value.mountOptions = '';
      } else if (props.editLocation.type === 'smb') {
        const smbConfig = props.editLocation.config as ISmbArchiveConfig;
        form.value.sharePath = smbConfig.sharePath || '';
        form.value.smbUsername = smbConfig.username || '';
        form.value.smbPassword = ''; // Don't pre-fill password for security
        form.value.smbDomain = smbConfig.domain || '';
        form.value.mountOptions = smbConfig.mountOptions || '';
        // Clear other type fields
        form.value.basePath = '';
        form.value.s3Bucket = ''; form.value.s3Region = ''; form.value.s3Prefix = '';
        form.value.s3Endpoint = ''; form.value.s3AccessKeyId = ''; form.value.s3SecretAccessKey = '';
      } else if (props.editLocation.type === 's3') {
        const s3Config = props.editLocation.config as IS3ArchiveConfig;
        form.value.s3Bucket = s3Config.bucket || '';
        form.value.s3Region = s3Config.region || '';
        form.value.s3Prefix = s3Config.prefix || '';
        form.value.s3Endpoint = s3Config.endpoint || '';
        form.value.s3AccessKeyId = s3Config.accessKeyId || '';
        form.value.s3SecretAccessKey = ''; // Don't pre-fill secret for security
        // Clear other type fields
        form.value.basePath = '';
        form.value.sharePath = ''; form.value.smbUsername = ''; form.value.smbPassword = '';
        form.value.smbDomain = ''; form.value.mountOptions = '';
      }
    } else {
      form.value = {
        name: '', type: 'local', basePath: '',
        sharePath: '', smbUsername: '', smbPassword: '', smbDomain: '', mountOptions: '',
        s3Bucket: '', s3Region: '', s3Prefix: '', s3Endpoint: '', s3AccessKeyId: '', s3SecretAccessKey: '',
        description: '', priority: 50,
      };
    }
  }
});

function close(): void {
  emit('update:modelValue', false);
}

function buildConfig(): Record<string, unknown> {
  if (form.value.type === 'local') {
    return { basePath: form.value.basePath };
  }
  if (form.value.type === 'smb') {
    const config: Record<string, unknown> = {
      sharePath: form.value.sharePath,
      username: form.value.smbUsername,
    };
    // Only send password if user entered a new one
    if (form.value.smbPassword) {
      config.password = form.value.smbPassword;
    }
    if (form.value.smbDomain) {
      config.domain = form.value.smbDomain;
    }
    if (form.value.mountOptions) {
      config.mountOptions = form.value.mountOptions;
    }
    return config;
  }
  if (form.value.type === 's3') {
    const config: Record<string, unknown> = {
      bucket: form.value.s3Bucket,
      region: form.value.s3Region,
      accessKeyId: form.value.s3AccessKeyId,
    };
    if (form.value.s3SecretAccessKey) {
      config.secretAccessKey = form.value.s3SecretAccessKey;
    }
    if (form.value.s3Prefix.trim()) {
      config.prefix = form.value.s3Prefix.trim();
    }
    if (form.value.s3Endpoint.trim()) {
      config.endpoint = form.value.s3Endpoint.trim();
    }
    return config;
  }
  return {};
}

async function save(): Promise<void> {
  if (!isValid.value) return;
  isSaving.value = true;

  try {
    const config = buildConfig();

    if (isEdit.value && props.editLocation) {
      const update: IUpdateArchiveLocationRequest = {
        name: form.value.name,
        description: form.value.description || undefined,
        config: config as unknown as IUpdateArchiveLocationRequest['config'],
        priority: form.value.priority,
      };
      const ok = await store.updateLocation(props.editLocation.id, update);
      if (ok) { emit('saved'); close(); }
    } else {
      const request: ICreateArchiveLocationRequest = {
        name: form.value.name,
        type: form.value.type,
        config: config as unknown as ICreateArchiveLocationRequest['config'],
        description: form.value.description || undefined,
        priority: form.value.priority,
      };
      const ok = await store.createLocation(request);
      if (ok) { emit('saved'); close(); }
    }
  } finally {
    isSaving.value = false;
  }
}

async function testConnection(): Promise<void> {
  if (!isEdit.value || !props.editLocation) return;
  isTesting.value = true;
  testResult.value = null;
  try {
    testResult.value = await store.testLocation(props.editLocation.id);
  } finally {
    isTesting.value = false;
  }
}
</script>

<template>
  <v-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" max-width="560" persistent>
    <v-card style="background-color: #22252d; border: 1px solid rgba(55, 65, 81, 0.3);">
      <v-card-title class="d-flex align-center pa-4">
        <v-icon class="mr-2" color="deep-purple">mdi-archive-plus</v-icon>
        {{ dialogTitle }}
      </v-card-title>

      <v-card-text class="px-4 pb-0">
        <v-text-field
          v-model="form.name"
          label="Location Name"
          placeholder="e.g. NAS Archive, LTO Tape"
          variant="outlined"
          density="comfortable"
          class="mb-3"
          :rules="[v => !!v.trim() || 'Name is required']"
        />

        <v-select
          v-model="form.type"
          label="Backend Type"
          :items="[
            { title: 'Local Path', value: 'local' },
            { title: 'SMB/CIFS Network Share', value: 'smb' },
            { title: 'S3 Compatible', value: 's3' },
            { title: 'Tape (coming soon)', value: 'tape', props: { disabled: true } },
          ]"
          variant="outlined"
          density="comfortable"
          class="mb-3"
          :disabled="isEdit"
        />

        <!-- Local path fields -->
        <v-text-field
          v-if="form.type === 'local'"
          v-model="form.basePath"
          label="Archive Base Path"
          placeholder="/mnt/archive or /nas/archive"
          variant="outlined"
          density="comfortable"
          class="mb-3"
          hint="Absolute path on the server filesystem"
          persistent-hint
          :rules="[v => !!v.trim() || 'Base path is required']"
        />

        <!-- SMB fields -->
        <template v-if="form.type === 'smb'">
          <v-text-field
            v-model="form.sharePath"
            label="SMB Share Path"
            placeholder="//192.168.1.50/archive"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            hint="UNC path to the SMB/CIFS share"
            persistent-hint
            :rules="[v => !!v.trim() || 'Share path is required']"
          />

          <div class="d-flex ga-3 mb-3">
            <v-text-field
              v-model="form.smbUsername"
              label="Username"
              placeholder="archiveuser"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
              :rules="[v => !!v.trim() || 'Username is required']"
            />
            <v-text-field
              v-model="form.smbPassword"
              label="Password"
              :placeholder="isEdit ? '(unchanged)' : ''"
              type="password"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
            />
          </div>

          <div class="d-flex ga-3 mb-3">
            <v-text-field
              v-model="form.smbDomain"
              label="Domain (optional)"
              placeholder="WORKGROUP"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
            />
            <v-text-field
              v-model="form.mountOptions"
              label="Mount Options (optional)"
              placeholder="vers=3.0"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
              hint="Additional CIFS mount options"
            />
          </div>
        </template>

        <!-- S3 fields -->
        <template v-if="form.type === 's3'">
          <div class="d-flex ga-3 mb-3">
            <v-text-field
              v-model="form.s3Bucket"
              label="Bucket Name"
              placeholder="my-archive-bucket"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
              :rules="[v => !!v.trim() || 'Bucket is required']"
            />
            <v-text-field
              v-model="form.s3Region"
              label="Region"
              placeholder="us-east-1"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
              :rules="[v => !!v.trim() || 'Region is required']"
            />
          </div>

          <div class="d-flex ga-3 mb-3">
            <v-text-field
              v-model="form.s3AccessKeyId"
              label="Access Key ID"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
              :rules="[v => !!v.trim() || 'Access Key ID is required']"
            />
            <v-text-field
              v-model="form.s3SecretAccessKey"
              label="Secret Access Key"
              :placeholder="isEdit ? '(unchanged)' : ''"
              type="password"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
            />
          </div>

          <v-text-field
            v-model="form.s3Endpoint"
            label="Custom Endpoint (optional)"
            placeholder="https://s3.us-east-1.amazonaws.com or https://minio.local:9000"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            hint="For S3-compatible services (Minio, Wasabi, Backblaze B2, etc.)"
            persistent-hint
          />

          <v-text-field
            v-model="form.s3Prefix"
            label="Key Prefix (optional)"
            placeholder="archive/editshare"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            hint="Prefix for all object keys within the bucket"
            persistent-hint
          />
        </template>

        <v-textarea
          v-model="form.description"
          label="Description (optional)"
          variant="outlined"
          density="comfortable"
          rows="2"
          class="mb-3"
        />

        <v-text-field
          v-model.number="form.priority"
          label="Restore Priority"
          type="number"
          min="1"
          max="100"
          variant="outlined"
          density="comfortable"
          class="mb-3"
          hint="Lower number = higher priority (tried first during restore). Default: 50"
          persistent-hint
        />

        <!-- Test connection (only for edit mode) -->
        <div v-if="isEdit" class="mb-3">
          <v-btn
            variant="outlined"
            color="info"
            size="small"
            :loading="isTesting"
            @click="testConnection"
          >
            <v-icon start>mdi-connection</v-icon>
            Test Connection
          </v-btn>

          <v-alert
            v-if="testResult"
            :type="testResult.ok ? 'success' : 'error'"
            variant="tonal"
            density="compact"
            class="mt-2"
          >
            {{ testResult.message }}
          </v-alert>
        </div>

        <v-alert v-if="store.error" type="error" variant="tonal" density="compact" class="mb-3">
          {{ store.error }}
        </v-alert>
      </v-card-text>

      <v-card-actions class="pa-4 pt-2">
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          color="deep-purple"
          variant="flat"
          :loading="isSaving"
          :disabled="!isValid"
          @click="save"
        >
          {{ isEdit ? 'Save Changes' : 'Create Location' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
