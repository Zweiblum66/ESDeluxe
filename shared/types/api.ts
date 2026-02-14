import type { ITieringSchedulerStatus, ITieringProgress } from './tiering';
import type { IAssetScanSchedulerStatus, ICatalogJobStats } from './asset-catalog';
import type { ITrashSchedulerStatus } from './trash';
import type { IQosSchedulerStatus } from './qos';
import type { IGuardianReceiverStatus } from './guardian';

/** Generic API response wrapper */
export interface IApiResponse<T> {
  data: T;
  message?: string;
}

/** Paginated API response */
export interface IPaginatedResponse<T> extends IApiResponse<T[]> {
  total: number;
  page: number;
  perPage: number;
}

/** API error response */
export interface IApiError {
  error: true;
  message: string;
  code: string;
  details?: unknown;
}

/** Health check response */
export interface IHealthStatus {
  status: 'ok' | 'degraded' | 'error';
  esApiConnected: boolean;
  ldapConnected: boolean;
  efsMounted: boolean;
  version: string;
  uptime: number;
}

/** Combined automation status — all background services in one response */
export interface IAutomationStatus {
  tiering: {
    scheduler: ITieringSchedulerStatus;
    progress: ITieringProgress | null;
  };
  catalogScan: {
    scheduler: IAssetScanSchedulerStatus;
    jobs: ICatalogJobStats;
  };
  trashPurge: ITrashSchedulerStatus;
  qos: IQosSchedulerStatus;
  guardian: IGuardianReceiverStatus;
}
