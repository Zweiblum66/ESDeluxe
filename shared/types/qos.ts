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

/** Saved QoS profile */
export interface IQosProfile {
  id: number;
  name: string;
  storageNodeGroup: string;
  config: Omit<IQosConfig, 'storageNodeGroup'>;
  createdAt: number;
  updatedAt: number;
}

/** QoS schedule for automated profile activation */
export interface IQosSchedule {
  id: number;
  profileId: number;
  cronExpression: string;
  enabled: boolean;
  lastRunAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** Alert threshold definition */
export interface IQosAlertThreshold {
  id: number;
  storageNodeGroup: string;
  poolName: string | null;
  thresholdBytesPerSec: number;
  direction: 'above' | 'below';
  enabled: boolean;
  cooldownMinutes: number;
  createdAt: number;
  updatedAt: number;
}

/** Alert event (triggered threshold breach) */
export interface IQosAlertEvent {
  id: number;
  thresholdId: number;
  triggeredAt: number;
  actualBytesPerSec: number;
  acknowledged: boolean;
  acknowledgedAt: number | null;
}

/** QoS scheduler status */
export interface IQosSchedulerStatus {
  enabled: boolean;
  running: boolean;
  lastPollAt: number | undefined;
  nextPollAt: number | undefined;
  pollCount: number;
  errorCount: number;
  pollIntervalSeconds: number;
  retentionDays: number;
}
