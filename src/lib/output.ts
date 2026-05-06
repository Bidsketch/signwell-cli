import axios from 'axios';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora, { type Ora } from 'ora';
import type { ApiError, JsonEnvelope } from '../types/api.js';
import { mapAxiosError, getExitCode } from './errors.js';

let jsonMode = false;
let quietMode = false;
let colorDisabled = process.env.NO_COLOR !== undefined;
const defaultChalkLevel = chalk.level;

export function setOutputMode(options: { json?: boolean; quiet?: boolean; noColor?: boolean }): void {
  if (options.json !== undefined) {
    jsonMode = !!options.json;
  }
  if (options.quiet !== undefined) {
    quietMode = !!options.quiet;
  }
  if (options.noColor !== undefined) {
    colorDisabled = !!options.noColor;
  }
  if (colorDisabled) {
    process.env.NO_COLOR = '1';
  }
  chalk.level = colorDisabled ? 0 : defaultChalkLevel;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

export function isQuietMode(): boolean {
  return quietMode;
}

export function printJson<T>(data: T, meta: Record<string, unknown> = {}): void {
  const envelope: JsonEnvelope<T> = {
    success: true,
    error: null,
    data,
    meta,
  };
  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
}

export function printNdjson(item: unknown): void {
  process.stdout.write(JSON.stringify(item) + '\n');
}

export function printErrorJson(error: ApiError): void {
  const envelope: JsonEnvelope<null> = {
    success: false,
    error,
    data: null,
    meta: {},
  };
  process.stderr.write(JSON.stringify(envelope, null, 2) + '\n');
}

export function printSuccess(message: string): void {
  if (quietMode) return;
  if (jsonMode) return;
  console.log(chalk.green('✓') + ' ' + message);
}

export function printWarning(message: string): void {
  if (quietMode) return;
  if (jsonMode) return;
  console.log(chalk.yellow('⚠') + ' ' + message);
}

export function printError(message: string, hint?: string): void {
  if (jsonMode) return;
  console.error(chalk.red.bold('Error:') + ' ' + message);
  if (hint) {
    console.error(chalk.dim('  Hint: ' + hint));
  }
}

export function printInfo(message: string): void {
  if (quietMode) return;
  if (jsonMode) return;
  console.log(message);
}

export function spinner(text: string): Ora {
  if (quietMode || jsonMode) {
    // Return a no-op spinner
    return ora({ text, isSilent: true });
  }
  return ora(text).start();
}

export function statusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'completed':
    case 'signed':
      return chalk.green(status);
    case 'sent':
    case 'shared':
    case 'viewed':
    case 'pending':
    case 'waiting':
      return chalk.yellow(status);
    case 'cancelled':
    case 'canceled':
    case 'expired':
    case 'bounced':
    case 'error':
    case 'failed':
    case 'declined':
      return chalk.red(status);
    case 'draft':
    case 'saved':
      return chalk.dim(status);
    default:
      return status;
  }
}

export function createTable(head: string[], colWidths?: number[]): Table.Table {
  const opts: Table.TableConstructorOptions = {
    head: head.map((h) => chalk.cyan(h)),
    style: { head: [], border: [] },
  };
  if (colWidths) {
    opts.colWidths = colWidths;
  }
  return new Table(opts) as Table.Table;
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toISOString().split('T')[0];
  } catch {
    return dateStr;
  }
}

export function handleOutputError(err: unknown): void {
  if (axios.isAxiosError(err)) {
    const apiError = mapAxiosError(err);
    if (jsonMode) {
      printErrorJson(apiError);
    } else {
      printError(apiError.message, apiError.hint);
    }
    process.exit(getExitCode(apiError));
  }

  if (err instanceof Error && 'exitCode' in err) {
    const cliErr = err as Error & { exitCode: number; hint?: string };
    if (jsonMode) {
      printErrorJson({
        code: cliErr.name.toUpperCase().replace('ERROR', '_ERROR').replace(/__/g, '_'),
        message: cliErr.message,
        hint: cliErr.hint || '',
        http_status: 0,
      });
    } else {
      printError(cliErr.message, cliErr.hint);
    }
    process.exit(cliErr.exitCode);
  }

  const message = err instanceof Error ? err.message : String(err);
  if (jsonMode) {
    printErrorJson({
      code: 'UNKNOWN_ERROR',
      message,
      hint: '',
      http_status: 0,
    });
  } else {
    printError(message);
  }
  process.exit(1);
}
