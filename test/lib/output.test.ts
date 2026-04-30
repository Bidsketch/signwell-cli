import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setOutputMode,
  isJsonMode,
  isQuietMode,
  formatDate,
  statusColor,
} from '../../src/lib/output.js';

describe('output', () => {
  beforeEach(() => {
    setOutputMode({ json: false, quiet: false });
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
});
