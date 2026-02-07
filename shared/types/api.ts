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
