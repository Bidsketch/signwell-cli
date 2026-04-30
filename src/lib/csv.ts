import fs from 'node:fs';
import { parse } from 'csv-parse/sync';
import { CsvError, FileError } from './errors.js';

export interface CsvRow {
  [key: string]: string;
}

export interface CsvUploadContent {
  content: string;
  rowCount: number;
}

export function readCsv(filePath: string): CsvRow[] {
  if (!fs.existsSync(filePath)) {
    throw new FileError(`CSV file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  try {
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as CsvRow[];

    if (records.length === 0) {
      throw new CsvError('CSV file is empty (no data rows found)');
    }

    return records;
  } catch (err) {
    if (err instanceof CsvError || err instanceof FileError) throw err;
    throw new CsvError(`Failed to parse CSV: ${(err as Error).message}`);
  }
}

export function readCsvForUpload(filePath: string, limit?: number): CsvUploadContent {
  if (!fs.existsSync(filePath)) {
    throw new FileError(`CSV file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  return prepareCsvForUpload(content, limit);
}

export function readCsvBuffer(content: string): CsvRow[] {
  try {
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as CsvRow[];

    return records;
  } catch (err) {
    throw new CsvError(`Failed to parse CSV: ${(err as Error).message}`);
  }
}

export function prepareCsvForUpload(content: string, limit?: number): CsvUploadContent {
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new CsvError('--limit must be a positive integer');
  }

  try {
    const records = parse(content, {
      skip_empty_lines: true,
      trim: true,
    }) as string[][];

    if (records.length === 0) {
      throw new CsvError('CSV file is empty');
    }

    const [header, ...rows] = records;
    if (!header || header.every((cell) => cell === '')) {
      throw new CsvError('CSV header row is empty');
    }
    if (rows.length === 0) {
      throw new CsvError('CSV file is empty (no data rows found)');
    }

    const limitedRows = limit === undefined ? rows : rows.slice(0, limit);
    return {
      content: stringifyCsv([header, ...limitedRows]),
      rowCount: limitedRows.length,
    };
  } catch (err) {
    if (err instanceof CsvError || err instanceof FileError) throw err;
    throw new CsvError(`Failed to parse CSV: ${(err as Error).message}`);
  }
}

function stringifyCsv(records: string[][]): string {
  return records.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}

function escapeCsvCell(cell: string): string {
  if (/[",\r\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}
