import { getEsApiClient } from './client.js';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';
import type { IQosConfig, IQosUsage } from '../../../../shared/types/qos.js';

/**
 * EditShare API response format for QoS configuration
 */
interface EsQosConfigResponse {
  storage_node_group: string;
  qos_enabled: boolean;
  pools: Array<{
    name: string;
    bandwidth_limit: number | null;
    consumers: Array<{
      type: string;
      name?: string;      // Used for user, group, workstation
      address?: string;   // Used for address type
    }>;
  }>;
  others_bandwidth_limit: number | null;
}

/**
 * EditShare API response format for QoS usage
 */
interface EsQosUsageResponse {
  storage_node_group: string;
  pools: Array<{
    pool_name: string | null;
    bytes_per_second: number;
  }>;
}

/**
 * GET /api/v1/qos/configuration
 * Retrieves QoS configuration for all storage node groups
 */
export async function getQosConfig(): Promise<IQosConfig[]> {
  const client = getEsApiClient();

  try {
    const response = await client.get<EsQosConfigResponse[]>('/api/v1/qos/configuration');

    // Debug logging to see actual response format
    logger.info({
      rawConsumers: response.data[0]?.pools[0]?.consumers,
    }, 'Raw QoS config response from EditShare API');

    const configs: IQosConfig[] = response.data.map((config) => ({
      storageNodeGroup: config.storage_node_group,
      qosEnabled: config.qos_enabled,
      pools: config.pools.map((pool) => ({
        name: pool.name,
        bandwidthLimit: pool.bandwidth_limit,
        consumers: pool.consumers.map((consumer) => {
          // EditShare API uses flat structure: { type, name/address }
          const mapped: any = { type: consumer.type };
          if (consumer.type === 'user' || consumer.type === 'group' || consumer.type === 'workstation') {
            // These types use 'name' field - map to specific type field
            if (consumer.type === 'user') mapped.user = consumer.name;
            if (consumer.type === 'group') mapped.group = consumer.name;
            if (consumer.type === 'workstation') mapped.workstation = consumer.name;
          } else if (consumer.type === 'address') {
            mapped.address = consumer.address;
          }
          return mapped;
        }),
      })),
      othersBandwidthLimit: config.others_bandwidth_limit,
    }));

    logger.debug({ count: configs.length }, 'Retrieved QoS configurations');
    return configs;
  } catch (err) {
    logger.error({ err }, 'Failed to get QoS configuration');
    throw new AppError('Failed to retrieve QoS configuration', 500, 'QOS_CONFIG_ERROR');
  }
}

/**
 * PUT /api/v1/qos/configuration/{storage_node_group}
 * Updates QoS configuration for a specific storage node group
 */
export async function setQosConfig(
  storageNodeGroup: string,
  config: Omit<IQosConfig, 'storageNodeGroup'>,
): Promise<void> {
  const client = getEsApiClient();

  const payload = {
    qos_enabled: config.qosEnabled,
    pools: config.pools.map((pool) => ({
      name: pool.name,
      bandwidth_limit: pool.bandwidthLimit,
      consumers: pool.consumers.map((consumer) => {
        const esConsumer: any = { type: consumer.type };
        // Use flat structure, not nested objects
        if (consumer.user) esConsumer.name = consumer.user;
        if (consumer.group) esConsumer.name = consumer.group;
        if (consumer.address) esConsumer.address = consumer.address;
        if (consumer.workstation) esConsumer.name = consumer.workstation;
        return esConsumer;
      }),
    })),
    others_bandwidth_limit: config.othersBandwidthLimit,
  };

  // Debug logging
  logger.info({
    storageNodeGroup,
    payload: JSON.stringify(payload, null, 2),
    consumerExample: payload.pools[0]?.consumers[0]
  }, 'Sending QoS configuration payload to EditShare API');

  try {
    await client.put(`/api/v1/qos/configuration/${encodeURIComponent(storageNodeGroup)}`, payload);
    logger.info({ storageNodeGroup }, 'QoS configuration updated');
  } catch (err) {
    logger.error({ err, storageNodeGroup }, 'Failed to update QoS configuration');
    throw new AppError('Failed to update QoS configuration', 500, 'QOS_UPDATE_ERROR');
  }
}

/**
 * GET /api/v1/qos/usage
 * Retrieves real-time bandwidth usage for all storage node groups
 */
export async function getQosUsage(): Promise<IQosUsage[]> {
  const client = getEsApiClient();

  try {
    const response = await client.get<EsQosUsageResponse[]>('/api/v1/qos/usage');
    const usage: IQosUsage[] = response.data.map((u) => ({
      storageNodeGroup: u.storage_node_group,
      pools: (u.pools || []).map((pool) => ({
        poolName: pool.pool_name,
        bytesPerSecond: pool.bytes_per_second,
      })),
    }));

    logger.debug({ count: usage.length }, 'Retrieved QoS bandwidth usage');
    return usage;
  } catch (err) {
    logger.error({ err }, 'Failed to get QoS usage');
    throw new AppError('Failed to retrieve QoS usage', 500, 'QOS_USAGE_ERROR');
  }
}

/**
 * GET /api/v1/qos/client_pools
 * Returns bandwidth limiting information for a client
 */
export async function getClientPools(params?: {
  user?: string;
  ip?: string;
  workstation?: string;
  protocol?: 'efs' | 'smb';
}): Promise<Record<string, string>> {
  const client = getEsApiClient();

  try {
    const response = await client.get<Record<string, string>>('/api/v1/qos/client_pools', {
      params,
    });

    logger.debug({ params }, 'Retrieved client pool assignments');
    return response.data;
  } catch (err) {
    logger.error({ err, params }, 'Failed to get client pools');
    throw new AppError('Failed to retrieve client pools', 500, 'QOS_CLIENT_POOLS_ERROR');
  }
}
