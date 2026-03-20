import fs from 'node:fs';
import { parse } from 'csv-parse/sync';
import { CsvError, FileError } from './errors.js';

export interface CsvRow {
  [key: string]: string;
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
