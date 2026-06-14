import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import axiosRetry from 'axios-retry';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getApiKey, getBaseUrl, getEnvApiKeyStatus, getTestMode } from '../lib/config.js';
import { mapAxiosError, getExitCode, AuthError } from '../lib/errors.js';
import { printErrorJson, printError, printWarning, isJsonMode } from '../lib/output.js';

export interface ApiClientOptions {
  apiKey?: string;
  baseUrl?: string;
  testMode?: boolean;
  timeout?: number;
  profile?: string;
  debug?: boolean;
  retries?: number;
}

let clientInstance: AxiosInstance | null = null;
let clientTestMode = false;
let clientDebug = false;

function getPackageVersion(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  for (const relativePath of ['../package.json', '../../package.json']) {
    try {
      const packageJson = JSON.parse(readFileSync(resolve(currentDir, relativePath), 'utf-8')) as {
        version?: unknown;
      };
      if (typeof packageJson.version === 'string' && packageJson.version.length > 0) {
        return packageJson.version;
      }
    } catch {
      // The source and bundled CLI resolve package.json from different depths.
    }
  }
  return '0.0.0';
}

export const SIGNWELL_USER_AGENT = `signwell-cli/${getPackageVersion()}`;

export function createApiClient(options: ApiClientOptions = {}): AxiosInstance {
  const hasExplicitApiKey = !!options.apiKey;
  if (!hasExplicitApiKey) {
    const envStatus = getEnvApiKeyStatus(options.profile);
    if (envStatus.warning) {
      printWarning(envStatus.warning.message, envStatus.warning.code);
    }
  }

  const apiKey = hasExplicitApiKey ? options.apiKey : getApiKey(options.profile);
  if (!apiKey) {
    throw new AuthError('No API key configured for the selected profile.');
  }

  const baseURL = options.baseUrl || getBaseUrl();
  const testMode = getTestMode(options.profile, options.testMode);
  const debug = options.debug ?? false;

  clientTestMode = testMode;
  clientDebug = debug;

  const client = axios.create({
    baseURL,
    timeout: options.timeout || 30000,
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
      'User-Agent': SIGNWELL_USER_AGENT,
    },
  });

  // Retry configuration
  axiosRetry(client, {
    retries: options.retries ?? 3,
    shouldResetTimeout: true,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error: AxiosError) => {
      const status = error.response?.status;
      return status === 429 || status === 503 || axiosRetry.isNetworkError(error);
    },
  });

  // Inject test_mode into POST/PUT/PATCH bodies
  client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    if (clientTestMode && config.data && ['post', 'put', 'patch'].includes(config.method || '')) {
      if (typeof config.data === 'object' && config.data !== null) {
        config.data.test_mode = true;
      }
    }

    if (clientDebug) {
      console.error(`[DEBUG] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
      if (config.data) {
        const logData = { ...config.data };
        // Don't log full base64 content
        if (logData.files) {
          logData.files = (logData.files as Array<Record<string, unknown>>).map((f) => ({
            ...f,
            file_base64: f.file_base64 ? '[base64 data]' : undefined,
          }));
        }
        console.error(`[DEBUG] Body:`, JSON.stringify(logData, null, 2));
      }
    }

    return config;
  });

  // Rate limit warning
  client.interceptors.response.use((response) => {
    const remaining = response.headers['x-ratelimit-remaining'];
    if (remaining !== undefined && parseInt(remaining, 10) < 5) {
      printWarning(`Rate limit: only ${remaining} requests remaining`);
    }

    if (clientDebug) {
      console.error(`[DEBUG] ${response.status} ${response.statusText}`);
    }

    return response;
  });

  clientInstance = client;
  return client;
}

export function getClient(options: ApiClientOptions = {}): AxiosInstance {
  if (!clientInstance) {
    return createApiClient(options);
  }
  return clientInstance;
}

export function resetClient(): void {
  clientInstance = null;
}

export function handleApiError(err: unknown): never {
  if (axios.isAxiosError(err)) {
    const apiError = mapAxiosError(err);
    if (isJsonMode()) {
      printErrorJson(apiError);
    } else {
      printError(apiError.message, apiError.hint);
    }
    process.exit(getExitCode(apiError));
  }
  throw err;
}
