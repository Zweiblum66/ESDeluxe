/** Consumer type for QoS pools */
export type ConsumerType = 'user' | 'group' | 'address' | 'workstation';

/** QoS pool consumer */
export interface IConsumer {
  type: ConsumerType;
  user?: string;
  group?: string;
  address?: string;
  workstation?: string;
}

/** QoS bandwidth pool */
export interface IPool {
  name: string;
  bandwidthLimit: number | null;
  consumers: IConsumer[];
}

/** QoS configuration for a storage node group */
export interface IQosConfig {
  storageNodeGroup: string;
  qosEnabled: boolean;
  pools: IPool[];
  othersBandwidthLimit: number | null;
}

/** Real-time bandwidth usage per pool */
export interface IPoolUsage {
  poolName: string | null;
  bytesPerSecond: number;
}

/** Bandwidth usage for a storage node group */
export interface IQosUsage {
  storageNodeGroup: string;
  pools: IPoolUsage[];
}

/** Bandwidth history record */
export interface IBandwidthRecord {
  timestamp: number;
  poolName: string;
  bytesPerSecond: number;
  storageNodeGroup: string;
}
