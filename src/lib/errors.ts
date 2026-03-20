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
  const status = err.response?.status || 500;
  const data = err.response?.data as Record<string, unknown> | undefined;
  const mapping = ERROR_MAP[status] || { code: 'UNKNOWN_ERROR', hint: 'An unexpected error occurred' };

  let message = mapping.code === 'VALIDATION_ERROR' && data
    ? extractValidationMessage(data)
    : (data?.message as string) || (data?.error as string) || err.message;

  if (status === 429) {
    const retryAfter = err.response?.headers?.['retry-after'];
    if (retryAfter) {
      mapping.hint = `Retry in ${retryAfter} seconds`;
    }
  }

  return {
    code: mapping.code,
    message,
    hint: mapping.hint,
    http_status: status,
  };
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
  constructor(message: string) {
    super(message, 5);
    this.name = 'FileError';
  }
}

export class CsvError extends CliError {
  constructor(message: string) {
    super(message, 6);
    this.name = 'CsvError';
  }
}

export class UsageError extends CliError {
  constructor(message: string) {
    super(message, 2);
    this.name = 'UsageError';
  }
}

export class AuthError extends CliError {
  constructor(message: string) {
    super(message, 3, 'Run `sw auth login` to set up your credentials');
    this.name = 'AuthError';
  }
}
