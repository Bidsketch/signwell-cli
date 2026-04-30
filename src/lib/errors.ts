import type { AxiosError } from 'axios';
import type { ApiError } from '../types/api.js';

const ERROR_MAP: Record<number, { code: string; hint: string }> = {
  401: {
    code: 'UNAUTHORIZED',
    hint: 'Run `sw auth login` to update your credentials',
  },
  403: {
    code: 'FORBIDDEN',
    hint: 'Your API key does not have permission for this action',
  },
  404: {
    code: 'NOT_FOUND',
    hint: 'Verify the ID is correct',
  },
  422: {
    code: 'VALIDATION_ERROR',
    hint: 'Check required fields with `sw schema <command>`',
  },
  429: {
    code: 'RATE_LIMITED',
    hint: 'Retry in a few seconds or reduce request frequency',
  },
  500: {
    code: 'SERVER_ERROR',
    hint: 'This is a SignWell server error. Try again later',
  },
  503: {
    code: 'SERVICE_UNAVAILABLE',
    hint: 'SignWell API is temporarily unavailable. Retrying automatically...',
  },
};

export function mapAxiosError(err: AxiosError): ApiError {
  if (!err.response) {
    return {
      code: 'NETWORK_ERROR',
      message: getNetworkErrorMessage(err),
      hint: 'Check SIGNWELL_API_BASE_URL and your network connection',
      http_status: 0,
    };
  }

  const status = err.response.status;
  const data = err.response?.data as Record<string, unknown> | undefined;
  const mapping = ERROR_MAP[status] || { code: 'UNKNOWN_ERROR', hint: 'An unexpected error occurred' };
  let hint = mapping.hint;

  const message = mapping.code === 'VALIDATION_ERROR' && data
    ? extractValidationMessage(data)
    : getApiErrorMessage(data, err.message, mapping.code);

  if (status === 429) {
    const retryAfter = err.response?.headers?.['retry-after'];
    if (retryAfter) {
      hint = `Retry in ${retryAfter} seconds`;
    }
  }

  return {
    code: mapping.code,
    message,
    hint,
    http_status: status,
  };
}

function getApiErrorMessage(
  data: Record<string, unknown> | undefined,
  fallback: string,
  code: string,
): string {
  const message = typeof data?.message === 'string' ? data.message.trim() : '';
  const error = typeof data?.error === 'string' ? data.error.trim() : '';
  const fallbackMessage = fallback.trim();
  return message || error || fallbackMessage || code;
}

function getNetworkErrorMessage(err: AxiosError): string {
  const target = getRequestTarget(err);
  const code = err.code || '';
  const message = err.message.trim();

  if (code === 'ECONNREFUSED') {
    return `Connection refused: could not connect to ${target}`;
  }
  if (code === 'ENOTFOUND') {
    return `Could not resolve SignWell API host for ${target}`;
  }
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
    return `Request timed out connecting to ${target}`;
  }

  return message || `Could not connect to ${target}`;
}

function getRequestTarget(err: AxiosError): string {
  const baseURL = err.config?.baseURL;
  const url = err.config?.url;

  if (baseURL && url) {
    try {
      return new URL(url, baseURL).toString();
    } catch {
      return `${baseURL}${url}`;
    }
  }

  return baseURL || url || 'the SignWell API server';
}

function flattenErrors(obj: unknown, prefix = ''): string[] {
  if (typeof obj === 'string') return [prefix ? `${prefix}: ${obj}` : obj];
  if (Array.isArray(obj)) return obj.map((item) => flattenErrors(item, prefix)).flat();
  if (typeof obj === 'object' && obj !== null) {
    return Object.entries(obj as Record<string, unknown>).flatMap(([key, val]) =>
      flattenErrors(val, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix ? `${prefix}: ${String(obj)}` : String(obj)];
}

function extractValidationMessage(data: Record<string, unknown>): string {
  if (data.errors && typeof data.errors === 'object') {
    const messages = flattenErrors(data.errors);
    return messages.join('; ');
  }
  return (data.message as string) || (data.error as string) || 'Validation error';
}

export function getExitCode(error: ApiError): number {
  switch (error.code) {
    case 'UNAUTHORIZED': return 3;
    case 'RATE_LIMITED': return 4;
    default: return 1;
  }
}

export class CliError extends Error {
  constructor(
    message: string,
    public exitCode: number = 1,
    public hint?: string,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export class FileError extends CliError {
  constructor(message: string, hint?: string) {
    super(message, 5, hint);
    this.name = 'FileError';
  }
}

export class CsvError extends CliError {
  constructor(message: string, hint?: string) {
    super(message, 6, hint);
    this.name = 'CsvError';
  }
}

export class UsageError extends CliError {
  constructor(message: string, hint?: string) {
    super(message, 2, hint);
    this.name = 'UsageError';
  }
}

export class AuthError extends CliError {
  constructor(message: string) {
    super(message, 3, 'Run `sw auth login` to set up your credentials');
    this.name = 'AuthError';
  }
}
