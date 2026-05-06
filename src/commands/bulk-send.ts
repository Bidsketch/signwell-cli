import fs from 'node:fs';
import type { Argv } from 'yargs';
import { createApiClient } from '../api/client.js';
import * as bulkApi from '../api/bulk-send.js';
import { paginate } from '../lib/pagination.js';
import {
  setOutputMode,
  printJson,
  printNdjson,
  printSuccess,
  printInfo,
  spinner,
  createTable,
  statusColor,
  formatDate,
  isJsonMode,
  handleOutputError,
} from '../lib/output.js';

export function registerBulkSendCommand(yargs: Argv): Argv {
  return yargs.command('bulk-send', 'Manage bulk sends', (y) =>
    y
      .command(
        'create',
        'Create a bulk send from CSV',
        (yy) =>
          yy
            .option('template', { type: 'string', array: true, demandOption: true, describe: 'Template ID(s)' })
            .option('csv', { type: 'string', demandOption: true, describe: 'Path to CSV file' })
            .option('name', { type: 'string', describe: 'Bulk send name' })
            .option('dry-run', { type: 'boolean', describe: 'Validate without sending' })
            .option('limit', { type: 'number', describe: 'Limit to first N rows' })
            .option('confirm', { type: 'boolean', describe: 'Skip confirmation' })
            .option('progress', { type: 'boolean', describe: 'Show progress bar' }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            createApiClient({
              profile: argv.profile as string,
              testMode: argv.testMode as boolean,
              debug: argv.debug as boolean,
            });

            // Dry run: validate only
            if (argv.dryRun) {
              const spin = spinner('Validating CSV...');
              const result = await bulkApi.validateCsv({
                template_ids: argv.template as string[],
                csv_file: argv.csv as string,
              });
              spin.succeed('Validation complete');

              if (isJsonMode()) {
                printJson(result);
              } else {
                printInfo('CSV Validation Results:');
                printInfo(JSON.stringify(result, null, 2));
              }
              return;
            }

            // Confirmation
            if (!argv.confirm) {
              const autoConfirm = process.env.SIGNWELL_AUTO_CONFIRM === 'true';
              if (!autoConfirm) {
                const { default: inquirer } = await import('inquirer');
                const answers = await inquirer.prompt([
                  {
                    type: 'confirm',
                    name: 'proceed',
                    message: 'Send bulk emails? This will send documents to all recipients.',
                    default: false,
                  },
                ]);
                if (!answers.proceed) {
                  printInfo('Cancelled');
                  return;
                }
              }
            }

            const spin = spinner('Creating bulk send...');
            const result = await bulkApi.createBulkSend({
              template_ids: argv.template as string[],
              name: argv.name as string | undefined,
              csv_file: argv.csv as string,
              limit: argv.limit as number | undefined,
            });
            spin.succeed('Bulk send created');

            if (isJsonMode()) {
              printJson(result);
            } else {
              printSuccess(`Bulk send created: ${result.id}`);
              printInfo(`Status: ${statusColor(result.status)}`);
              printInfo(`Total: ${result.total}`);
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command(
        'get <id>',
        'Get bulk send details',
        (yy) => yy.positional('id', { type: 'string', demandOption: true }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            createApiClient({
              profile: argv.profile as string,
              testMode: argv.testMode as boolean,
              debug: argv.debug as boolean,
            });

            const spin = spinner('Fetching bulk send...');
            const result = await bulkApi.getBulkSend(argv.id as string);
            spin.succeed('Bulk send retrieved');

            if (isJsonMode()) {
              printJson(result);
            } else {
              printInfo(`Bulk Send: ${result.id}`);
              if (result.name) printInfo(`Name: ${result.name}`);
              printInfo(`Status: ${statusColor(result.status)}`);
              printInfo(`Total: ${result.total}`);
              if (result.sent !== undefined) printInfo(`Sent: ${result.sent}`);
              if (result.failed !== undefined) printInfo(`Failed: ${result.failed}`);
              printInfo(`Created: ${formatDate(result.created_at)}`);
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command(
        'list',
        'List bulk sends',
        (yy) =>
          yy
            .option('page', { type: 'number', default: 1 })
            .option('per-page', { type: 'number', default: 20 })
            .option('all', { type: 'boolean', describe: 'Fetch all pages' })
            .option('all-pages', { type: 'boolean', describe: 'Alias for --all' }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            createApiClient({
              profile: argv.profile as string,
              testMode: argv.testMode as boolean,
              debug: argv.debug as boolean,
            });

            const fetchAll = argv.all || argv.allPages;

            if (fetchAll) {
              const spin = spinner('Fetching all bulk sends...');
              const fetcher = (page: number, perPage: number) =>
                bulkApi.listBulkSends({ page, per_page: perPage });

              const items: unknown[] = [];
              for await (const bs of paginate(fetcher, {
                perPage: 100,
                onPage: (current, total) => {
                  spin.text = `Fetching page ${current} of ${total}...`;
                },
              })) {
                if (isJsonMode()) {
                  printNdjson(bs);
                } else {
                  items.push(bs);
                }
              }
              spin.succeed(`Fetched ${isJsonMode() ? 'all' : items.length} bulk sends`);

              if (!isJsonMode() && items.length > 0) {
                const table = createTable(['ID', 'Name', 'Status', 'Total', 'Created']);
                for (const b of items) {
                  const bs = b as any;
                  table.push([bs.id, bs.name || '-', statusColor(bs.status), bs.total, formatDate(bs.created_at)]);
                }
                printInfo(table.toString());
              }
              return;
            }

            const spin = spinner('Fetching bulk sends...');
            const result = await bulkApi.listBulkSends({
              page: argv.page,
              per_page: argv.perPage,
            });
            spin.succeed('Bulk sends retrieved');

            if (isJsonMode()) {
              printJson(result.data, {
                count: result.data.length,
                total: result.total,
                page: result.page,
                per_page: result.per_page,
                total_pages: result.total_pages,
              });
            } else {
              const table = createTable(['ID', 'Name', 'Status', 'Total', 'Created']);
              for (const bs of result.data) {
                table.push([bs.id, bs.name || '-', statusColor(bs.status), bs.total, formatDate(bs.created_at)]);
              }
              printInfo(table.toString());
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command(
        'documents <id>',
        'List documents in a bulk send',
        (yy) =>
          yy
            .positional('id', { type: 'string', demandOption: true })
            .option('page', { type: 'number', default: 1 })
            .option('per-page', { type: 'number', default: 20 })
            .option('all', { type: 'boolean', describe: 'Fetch all pages' })
            .option('all-pages', { type: 'boolean', describe: 'Alias for --all' }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            createApiClient({
              profile: argv.profile as string,
              testMode: argv.testMode as boolean,
              debug: argv.debug as boolean,
            });

            const fetchAll = argv.all || argv.allPages;

            if (fetchAll) {
              const spin = spinner('Fetching all documents...');
              const fetcher = (page: number, perPage: number) =>
                bulkApi.listBulkSendDocuments(argv.id as string, { page, per_page: perPage });

              const items: unknown[] = [];
              for await (const doc of paginate(fetcher, {
                perPage: 100,
                onPage: (current, total) => {
                  spin.text = `Fetching page ${current} of ${total}...`;
                },
              })) {
                if (isJsonMode()) {
                  printNdjson(doc);
                } else {
                  items.push(doc);
                }
              }
              spin.succeed(`Fetched ${isJsonMode() ? 'all' : items.length} documents`);

              if (!isJsonMode() && items.length > 0) {
                const table = createTable(['ID', 'Name', 'Status', 'Created']);
                for (const d of items) {
                  const doc = d as any;
                  table.push([doc.id, doc.name || '-', statusColor(doc.status), formatDate(doc.created_at)]);
                }
                printInfo(table.toString());
              }
              return;
            }

            const spin = spinner('Fetching documents...');
            const result = await bulkApi.listBulkSendDocuments(argv.id as string, {
              page: argv.page,
              per_page: argv.perPage,
            });
            spin.succeed('Documents retrieved');

            if (isJsonMode()) {
              printJson(result.data, {
                count: result.data.length,
                total: result.total,
                page: result.page,
                per_page: result.per_page,
                total_pages: result.total_pages,
              });
            } else {
              const table = createTable(['ID', 'Name', 'Status', 'Created']);
              for (const doc of result.data) {
                table.push([doc.id, doc.name || '-', statusColor(doc.status), formatDate(doc.created_at)]);
              }
              printInfo(table.toString());
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command(
        'csv-template',
        'Download a blank CSV template',
        (yy) =>
          yy
            .option('template', { type: 'string', array: true, demandOption: true, describe: 'Template ID(s)' })
            .option('output', { type: 'string', alias: 'o', describe: 'Output file path' }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            createApiClient({
              profile: argv.profile as string,
              testMode: argv.testMode as boolean,
              debug: argv.debug as boolean,
            });

            const spin = spinner('Downloading CSV template...');
            const csv = await bulkApi.getCsvTemplate(argv.template as string[]);

            const outputPath = (argv.output as string) || 'bulk_template.csv';
            fs.writeFileSync(outputPath, csv, 'utf-8');
            spin.succeed(`CSV template saved to ${outputPath}`);

            if (isJsonMode()) {
              printJson({ output: outputPath });
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command(
        'validate',
        'Validate a CSV without creating a bulk send',
        (yy) =>
          yy
            .option('template', { type: 'string', array: true, demandOption: true, describe: 'Template ID(s)' })
            .option('csv', { type: 'string', demandOption: true, describe: 'Path to CSV file' }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            createApiClient({
              profile: argv.profile as string,
              testMode: argv.testMode as boolean,
              debug: argv.debug as boolean,
            });

            const spin = spinner('Validating CSV...');
            const result = await bulkApi.validateCsv({
              template_ids: argv.template as string[],
              csv_file: argv.csv as string,
            });
            spin.succeed('Validation complete');

            if (isJsonMode()) {
              printJson(result);
            } else {
              printInfo('Validation Results:');
              printInfo(JSON.stringify(result, null, 2));
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .demandCommand(1, 'Please specify a subcommand'),
  );
}
