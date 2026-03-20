import { describe, it, expect } from 'vitest';
import {
  CliError,
  FileError,
  CsvError,
  UsageError,
  AuthError,
  mapAxiosError,
  getExitCode,
} from '../../src/lib/errors.js';
import type { AxiosError } from 'axios';

describe('errors', () => {
  describe('custom error classes', () => {
    it('CliError has correct exit code', () => {
      const err = new CliError('test error', 1, 'hint');
      expect(err.message).toBe('test error');
      expect(err.exitCode).toBe(1);
      expect(err.hint).toBe('hint');
    });

    it('FileError has exit code 5', () => {
      const err = new FileError('file not found');
      expect(err.exitCode).toBe(5);
    });

    it('CsvError has exit code 6', () => {
      const err = new CsvError('csv parse error');
      expect(err.exitCode).toBe(6);
    });

    it('UsageError has exit code 2', () => {
      const err = new UsageError('invalid args');
      expect(err.exitCode).toBe(2);
    });

    it('AuthError has exit code 3', () => {
      const err = new AuthError('no api key');
      expect(err.exitCode).toBe(3);
      expect(err.hint).toContain('sw auth login');
    });
  });

  describe('mapAxiosError', () => {
    function makeAxiosError(status: number, data?: Record<string, unknown>): AxiosError {
      return {
        response: {
          status,
          data: data || {},
          headers: {},
          statusText: '',
          config: {} as any,
        },
        message: 'Request failed',
        isAxiosError: true,
        config: {} as any,
        name: 'AxiosError',
        toJSON: () => ({}),
      } as AxiosError;
    }

    it('maps 401 to UNAUTHORIZED', () => {
      const err = mapAxiosError(makeAxiosError(401));
      expect(err.code).toBe('UNAUTHORIZED');
      expect(err.http_status).toBe(401);
    });

    it('maps 404 to NOT_FOUND', () => {
      const err = mapAxiosError(makeAxiosError(404));
      expect(err.code).toBe('NOT_FOUND');
    });

    it('maps 422 to VALIDATION_ERROR', () => {
      const err = mapAxiosError(makeAxiosError(422, {
        errors: { name: ['is required'] },
      }));
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.message).toContain('name');
    });

    it('maps 429 to RATE_LIMITED', () => {
      const err = mapAxiosError(makeAxiosError(429));
      expect(err.code).toBe('RATE_LIMITED');
    });

    it('maps 503 to SERVICE_UNAVAILABLE', () => {
      const err = mapAxiosError(makeAxiosError(503));
      expect(err.code).toBe('SERVICE_UNAVAILABLE');
    });
  });

  describe('getExitCode', () => {
    it('returns 3 for UNAUTHORIZED', () => {
      expect(getExitCode({ code: 'UNAUTHORIZED', message: '', hint: '', http_status: 401 })).toBe(3);
    });

    it('returns 4 for RATE_LIMITED', () => {
      expect(getExitCode({ code: 'RATE_LIMITED', message: '', hint: '', http_status: 429 })).toBe(4);
    });

    it('returns 1 for other errors', () => {
      expect(getExitCode({ code: 'NOT_FOUND', message: '', hint: '', http_status: 404 })).toBe(1);
    });
  });
});
