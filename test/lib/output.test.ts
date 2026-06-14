import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  clearWarnings,
  setOutputMode,
  isJsonMode,
  isQuietMode,
  formatDate,
  printErrorJson,
  printJson,
  printWarning,
  statusColor,
} from '../../src/lib/output.js';

describe('output', () => {
  beforeEach(() => {
    setOutputMode({ json: false, quiet: false });
    clearWarnings();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearWarnings();
  });

  it('setOutputMode sets json mode', () => {
    setOutputMode({ json: true });
    expect(isJsonMode()).toBe(true);
  });

  it('setOutputMode sets quiet mode', () => {
    setOutputMode({ quiet: true });
    expect(isQuietMode()).toBe(true);
  });

  it('formatDate formats ISO date strings', () => {
    expect(formatDate('2024-01-15T10:00:00Z')).toBe('2024-01-15');
  });

  it('formatDate returns dash for empty string', () => {
    expect(formatDate('')).toBe('-');
  });

  it('formatDate handles invalid date gracefully', () => {
    const result = formatDate('not-a-date');
    expect(typeof result).toBe('string');
  });

  it('setOutputMode disables ANSI color output', () => {
    setOutputMode({ noColor: true });
    expect(statusColor('completed')).not.toContain('\u001b[');
    setOutputMode({ noColor: false });
  });

  it('adds pending warnings to JSON success metadata without changing data', () => {
    setOutputMode({ json: true, quiet: false });
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    printWarning('SIGNWELL_API_KEY is set but ignored.', 'SIGNWELL_API_KEY_IGNORED');
    printJson({ ok: true }, { count: 1 });

    const output = stdout.mock.calls.map((call) => String(call[0])).join('');
    const parsed = JSON.parse(output);

    expect(parsed.data).toEqual({ ok: true });
    expect(parsed.meta.count).toBe(1);
    expect(parsed.meta.warnings).toEqual([
      {
        code: 'SIGNWELL_API_KEY_IGNORED',
        message: 'SIGNWELL_API_KEY is set but ignored.',
      },
    ]);
  });

  it('adds pending warnings to JSON error metadata', () => {
    setOutputMode({ json: true, quiet: false });
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    printWarning('SIGNWELL_API_KEY is set but ignored.', 'SIGNWELL_API_KEY_IGNORED');
    printErrorJson({
      code: 'AUTH_ERROR',
      message: 'No API key configured for the selected profile.',
      hint: 'Run `sw auth login` to set up your credentials',
      http_status: 0,
    });

    const output = stderr.mock.calls.map((call) => String(call[0])).join('');
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(false);
    expect(parsed.data).toBeNull();
    expect(parsed.meta.warnings).toEqual([
      {
        code: 'SIGNWELL_API_KEY_IGNORED',
        message: 'SIGNWELL_API_KEY is set but ignored.',
      },
    ]);
  });
});
