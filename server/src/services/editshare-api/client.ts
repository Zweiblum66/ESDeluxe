import axios, { type AxiosInstance, type InternalAxiosRequestConfig, type AxiosResponse, type AxiosError } from 'axios';
import https from 'https';
import { logger } from '../../utils/logger.js';
import { ApiError } from '../../utils/errors.js';

interface ClientOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  allowSelfSigned: boolean;
  timeout?: number;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Creates an Axios instance configured for the EditShare API.
 * Includes request/response logging interceptors and retry on 5xx.
 */
export function createEsApiClient(options: ClientOptions): AxiosInstance {
  const { host, port, username, password, allowSelfSigned, timeout = 30_000 } = options;

  const client = axios.create({
    baseURL: `https://${host}:${port}`,
    timeout,
    auth: {
      username,
      password,
    },
    httpsAgent: new https.Agent({
      rejectUnauthorized: !allowSelfSigned,
    }),
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  // Request interceptor - log outgoing requests
  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      logger.debug(
        { method: config.method?.toUpperCase(), url: config.url },
        `ES API request: ${config.method?.toUpperCase()} ${config.url}`,
      );
      return config;
    },
    (error: AxiosError) => {
      logger.error({ err: error }, 'ES API request error');
      return Promise.reject(error);
    },
  );

  // Response interceptor - log responses
  client.interceptors.response.use(
    (response: AxiosResponse) => {
      logger.debug(
        {
          status: response.status,
          url: response.config.url,
        },
        `ES API response: ${response.status} ${response.config.url}`,
      );
      return response;
    },
    async (error: AxiosError) => {
      const config = error.config as InternalAxiosRequestConfig & { _retryCount?: number };

      // Retry on 5xx errors
      if (error.response && error.response.status >= 500 && config) {
        const retryCount = config._retryCount ?? 0;

        if (retryCount < MAX_RETRIES) {
          config._retryCount = retryCount + 1;
          const delay = BASE_DELAY_MS * Math.pow(2, retryCount); // 1s, 2s, 4s

          logger.warn(
            {
              attempt: retryCount + 1,
              maxRetries: MAX_RETRIES,
              delay,
              url: config.url,
              status: error.response.status,
            },
            `ES API 5xx error, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`,
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
          return client.request(config);
        }
      }

      const status = error.response?.status ?? 0;
      const message = error.response?.data
        ? JSON.stringify(error.response.data)
        : error.message;

      logger.error(
        { status, url: config?.url, message },
        `ES API error: ${status} ${config?.url}`,
      );

      throw new ApiError(
        `EditShare API error: ${message}`,
        status >= 400 ? status : 502,
        { originalStatus: status, url: config?.url },
      );
    },
  );

  return client;
}

/** Singleton ES API client instance */
let _client: AxiosInstance | null = null;

/**
 * Returns the singleton ES API client.
 * Must be initialized first by calling initEsApiClient().
 */
export function getEsApiClient(): AxiosInstance {
  if (!_client) {
    throw new Error('ES API client not initialized. Call initEsApiClient() first.');
  }
  return _client;
}

/**
 * Initializes the singleton ES API client with the given options.
 */
export function initEsApiClient(options: ClientOptions): AxiosInstance {
  _client = createEsApiClient(options);
  return _client;
}
