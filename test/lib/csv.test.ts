import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readCsv, readCsvBuffer, prepareCsvForUpload } from '../../src/lib/csv.js';

const tmpDir = path.join(os.tmpdir(), 'signwell-csv-test-' + Date.now());

beforeEach(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('csv', () => {
  it('reads a valid CSV file', () => {
    const csvPath = path.join(tmpDir, 'test.csv');
    fs.writeFileSync(csvPath, 'name,email\nAlice,alice@example.com\nBob,bob@example.com');
    const rows = readCsv(csvPath);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Alice');
    expect(rows[0].email).toBe('alice@example.com');
    expect(rows[1].name).toBe('Bob');
  });

  it('throws for non-existent file', () => {
    expect(() => readCsv('/nonexistent.csv')).toThrow('CSV file not found');
  });

  it('throws for empty CSV', () => {
    const csvPath = path.join(tmpDir, 'empty.csv');
    fs.writeFileSync(csvPath, 'name,email\n');
    expect(() => readCsv(csvPath)).toThrow('CSV file is empty');
  });

  it('trims whitespace in values', () => {
    const csvPath = path.join(tmpDir, 'spaces.csv');
    fs.writeFileSync(csvPath, 'name,email\n  Alice  ,  alice@example.com  \n');
    const rows = readCsv(csvPath);
    expect(rows[0].name).toBe('Alice');
    expect(rows[0].email).toBe('alice@example.com');
  });

  it('readCsvBuffer parses CSV content', () => {
    const rows = readCsvBuffer('name,email\nAlice,alice@example.com');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Alice');
  });

  it('readCsvBuffer throws for invalid content', () => {
    expect(() => readCsvBuffer('"unclosed')).toThrow('Failed to parse CSV');
  });

  it('prepareCsvForUpload keeps the header and limits data rows', () => {
    const result = prepareCsvForUpload('name,email\nAlice,alice@example.com\nBob,bob@example.com', 1);
    expect(result.rowCount).toBe(1);
    expect(result.content).toBe('name,email\nAlice,alice@example.com');
  });

  it('prepareCsvForUpload rejects invalid limits', () => {
    expect(() => prepareCsvForUpload('name,email\nAlice,alice@example.com', 0)).toThrow('--limit');
  });
});
