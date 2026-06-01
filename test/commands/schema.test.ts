import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import yargs from 'yargs/yargs';
import { registerSchemaCommand } from '../../src/commands/schema.js';
import { setOutputMode } from '../../src/lib/output.js';

describe('schema command', () => {
  let stdoutSpy: any;

  beforeEach(() => {
    setOutputMode({ json: false, quiet: false });
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as any);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    setOutputMode({ json: false, quiet: false });
  });

  function runSchemaCommand(args: string[]): void {
    const parser = yargs(args)
      .parserConfiguration({ 'boolean-negation': false })
      .scriptName('sw')
      .option('json', {
        type: 'boolean',
        default: false,
        global: true,
      })
      .option('quiet', {
        type: 'boolean',
        default: false,
        global: true,
      })
      .middleware((argv) => {
        setOutputMode({
          json: argv.json as boolean,
          quiet: argv.quiet as boolean,
        });
      })
      .exitProcess(false)
      .fail((message, err) => {
        throw err || new Error(message || 'CLI failed');
      });

    registerSchemaCommand(parser);
    parser.parseSync();
  }

  it('prints a bare schema object when --json is enabled', () => {
    runSchemaCommand(['schema', 'documents.create', '--json']);

    const output = stdoutSpy.mock.calls.map(([chunk]: [unknown]) => String(chunk)).join('');
    const schema = JSON.parse(output);

    expect(schema.command).toBe('documents.create');
    expect(schema.input_schema.type).toBe('object');
    expect(schema.output_schema.type).toBe('object');
    expect(schema.success).toBeUndefined();
  });

  it('exposes document list pagination and filter inputs', () => {
    runSchemaCommand(['schema', 'documents.list', '--json']);

    const output = stdoutSpy.mock.calls.map(([chunk]: [unknown]) => String(chunk)).join('');
    const schema = JSON.parse(output);
    const properties = schema.input_schema.properties;

    expect(properties.limit.type).toBe('number');
    expect(properties.query.type).toBe('string');
    expect(properties.name.type).toBe('string');
    expect(properties.person.type).toBe('string');
    expect(properties.start_date.type).toBe('string');
    expect(properties.end_date.type).toBe('string');
    expect(properties.document_ids.type).toBe('array');
  });
});
