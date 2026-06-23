import type { Argv } from 'yargs';
import fs from 'node:fs';
import { createApiClient } from '../api/client.js';
import * as templatesApi from '../api/templates.js';
import * as docsApi from '../api/documents.js';
import { resolveFiles } from '../lib/upload.js';
import { paginate } from '../lib/pagination.js';
import { UsageError } from '../lib/errors.js';
import {
  setOutputMode,
  printJson,
  printNdjson,
  printSuccess,
  printError,
  printInfo,
  spinner,
  createTable,
  formatDate,
  isJsonMode,
  handleOutputError,
} from '../lib/output.js';

export interface TemplateListCliOptions {
  page?: number;
  perPage?: number;
  per_page?: number;
  limit?: number;
  query?: string;
  name?: string;
  status?: string;
  startDate?: string;
  start_date?: string;
  endDate?: string;
  end_date?: string;
  templateIds?: string | string[];
  template_ids?: string | string[];
}

const DATE_FILTER_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const OR_FILTER_PATTERN = /(^|\s)OR(\s|$)/i;
const TEMPLATE_LIST_ALL_PAGE_SIZE = 100;

function normalizedString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function normalizeDateFilter(value: string | undefined, optionName: string): string | undefined {
  const normalized = normalizedString(value);
  if (normalized && !DATE_FILTER_PATTERN.test(normalized)) {
    throw new UsageError(
      `--${optionName} must use YYYY-MM-DD format`,
      `Example: --${optionName} 2026-02-15`,
    );
  }
  return normalized;
}

function normalizeRawQuery(value: string | undefined): string | undefined {
  const normalized = normalizedString(value);
  if (normalized && OR_FILTER_PATTERN.test(normalized)) {
    throw new UsageError(
      'OR is not supported in --query',
      'Use AND between filters, for example: --query "name:Classic AND status:Available"',
    );
  }
  return normalized;
}

function normalizeTemplateLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) return undefined;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new UsageError(
      '--limit/--per-page must be a positive integer',
      'Example: --limit 30 --page 2',
    );
  }
  return limit;
}

function normalizeTemplateIds(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;

  const values = Array.isArray(value) ? value : [value];
  const ids = values
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);

  return ids.length > 0 ? ids.join(',') : undefined;
}

function addQueryFilter(parts: string[], key: string, value: string | undefined): void {
  const normalized = normalizedString(value);
  if (normalized) {
    parts.push(`${key}:${normalized}`);
  }
}

export function buildTemplateListQuery(options: TemplateListCliOptions): string | undefined {
  const parts: string[] = [];
  const rawQuery = normalizeRawQuery(options.query);

  if (rawQuery) parts.push(rawQuery);
  addQueryFilter(parts, 'name', options.name);
  addQueryFilter(parts, 'status', options.status);
  addQueryFilter(parts, 'start_date', normalizeDateFilter(options.startDate ?? options.start_date, 'start-date'));
  addQueryFilter(parts, 'end_date', normalizeDateFilter(options.endDate ?? options.end_date, 'end-date'));
  addQueryFilter(parts, 'template_ids', normalizeTemplateIds(options.templateIds ?? options.template_ids));

  return parts.length > 0 ? parts.join(' AND ') : undefined;
}

export function buildTemplateListParams(options: TemplateListCliOptions): templatesApi.TemplateListParams {
  return {
    page: options.page,
    limit: normalizeTemplateLimit(options.limit ?? options.perPage ?? options.per_page),
    query: buildTemplateListQuery(options),
  };
}

export function buildTemplateListPageParams(
  query: string | undefined,
  page: number,
  perPage: number,
): templatesApi.TemplateListParams {
  return {
    page,
    limit: normalizeTemplateLimit(perPage),
    query,
  };
}

export function registerTemplatesCommand(yargs: Argv): Argv {
  return yargs.command('templates', 'Manage templates', (y) =>
    y
      .command(
        'create',
        'Create a new template',
        (yy) =>
          yy
            .option('file', { type: 'string', array: true, describe: 'Local file path(s)' })
            .option('file-url', { type: 'string', array: true, describe: 'Remote file URL(s)' })
            .option('file-b64', { type: 'string', describe: 'Path to base64-encoded file' })
            .option('file-b64-name', { type: 'string', describe: 'Filename for base64 upload' })
            .option('name', { type: 'string', demandOption: true, describe: 'Template name' })
            .option('placeholder', { type: 'string', array: true, describe: 'Placeholder as "Name:email:display_name"' })
            .option('text-tags', { type: 'boolean', describe: 'Enable text tag parsing' })
            .option('fields', { type: 'string', describe: 'Path to fields JSON file' }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            createApiClient({
              profile: argv.profile as string,
              testMode: argv.testMode as boolean,
              debug: argv.debug as boolean,
            });

            const spin = spinner('Preparing files...');
            const files = await resolveFiles(
              argv.file as string[] | undefined,
              argv.fileUrl as string[] | undefined,
              argv.fileB64 as string | undefined,
              argv.fileB64Name as string | undefined,
            );

            spin.text = 'Creating template...';

            const placeholders = (argv.placeholder as string[] | undefined)?.map((spec) => {
              const parts = spec.split(':');
              return { name: parts[0], email: parts[1] || undefined };
            });

            let fields: unknown[] | undefined;
            if (argv.fields) {
              const fieldsContent = fs.readFileSync(argv.fields as string, 'utf-8');
              fields = JSON.parse(fieldsContent);
            }

            const hasFields = fields && fields.length > 0;

            const template = await templatesApi.createTemplate({
              name: argv.name as string,
              text_tags: argv.textTags as boolean | undefined,
              draft: hasFields ? undefined : true,
              files,
              placeholders,
              fields: hasFields ? fields : undefined,
            });

            spin.succeed('Template created');

            if (isJsonMode()) {
              printJson(template);
            } else {
              printSuccess(`Template created: ${template.id}`);
              printInfo(`Name: ${template.name}`);
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command(
        'get <id>',
        'Get template details',
        (yy) => yy.positional('id', { type: 'string', demandOption: true }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            createApiClient({
              profile: argv.profile as string,
              testMode: argv.testMode as boolean,
              debug: argv.debug as boolean,
            });

            const spin = spinner('Fetching template...');
            const template = await templatesApi.getTemplate(argv.id as string);
            spin.succeed('Template retrieved');

            if (isJsonMode()) {
              printJson(template);
            } else {
              printInfo(`Template: ${template.name} (${template.id})`);
              printInfo(`Created: ${formatDate(template.created_at)}`);

              if (template.placeholder_roles && template.placeholder_roles.length > 0) {
                printInfo('\nPlaceholder Roles:');
                const table = createTable(['Name', 'Email']);
                for (const role of template.placeholder_roles) {
                  table.push([role.name, role.email || '-']);
                }
                printInfo(table.toString());
              }
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command(
        'list',
        'List templates',
        (yy) =>
          yy
            .option('page', { type: 'number', default: 1 })
            .option('per-page', { type: 'number', default: 20, alias: ['limit', 'per_page'], describe: 'Items per page' })
            .option('query', { type: 'string', describe: 'Raw API filter query, e.g. "name:Classic AND status:Available"' })
            .option('name', { type: 'string', describe: 'Filter by template name' })
            .option('status', { type: 'string', describe: 'Filter by template status' })
            .option('start-date', { type: 'string', alias: 'start_date', describe: 'Filter templates created on or after YYYY-MM-DD' })
            .option('end-date', { type: 'string', alias: 'end_date', describe: 'Filter templates created on or before YYYY-MM-DD' })
            .option('template-ids', { type: 'string', array: true, alias: 'template_ids', describe: 'Filter by template ID(s), comma-separated or repeated' })
            .option('all', { type: 'boolean', describe: 'Fetch all pages' })
            .option('all-pages', { type: 'boolean', describe: 'Alias for --all' }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            const fetchAll = argv.all || argv.allPages;
            const listParams = buildTemplateListParams(argv);
            const listQuery = listParams.query;

            createApiClient({
              profile: argv.profile as string,
              testMode: argv.testMode as boolean,
              debug: argv.debug as boolean,
            });

            if (fetchAll) {
              const spin = spinner('Fetching all templates...');
              const fetcher = (page: number, perPage: number) =>
                templatesApi.listTemplates(buildTemplateListPageParams(listQuery, page, perPage));

              const items: unknown[] = [];

              for await (const tmpl of paginate(fetcher, {
                perPage: TEMPLATE_LIST_ALL_PAGE_SIZE,
                onPage: (current, total) => {
                  spin.text = `Fetching page ${current} of ${total}...`;
                },
              })) {
                if (isJsonMode()) {
                  printNdjson(tmpl);
                } else {
                  items.push(tmpl);
                }
              }

              spin.succeed(`Fetched ${isJsonMode() ? 'all' : items.length} templates`);

              if (!isJsonMode() && items.length > 0) {
                const table = createTable(['ID', 'Name', 'Created']);
                for (const t of items) {
                  const tmpl = t as any;
                  table.push([tmpl.id, tmpl.name || '-', formatDate(tmpl.created_at)]);
                }
                printInfo(table.toString());
              }
              return;
            }

            const spin = spinner('Fetching templates...');
            const result = await templatesApi.listTemplates(listParams);
            spin.succeed('Templates retrieved');

            if (isJsonMode()) {
              printJson(result.data, {
                count: result.data.length,
                total: result.total,
                page: result.page,
                per_page: result.per_page,
                total_pages: result.total_pages,
                next_page: result.page < result.total_pages ? result.page + 1 : null,
                prev_page: result.page > 1 ? result.page - 1 : null,
              });
            } else {
              printInfo(`Templates (page ${result.page} of ${result.total_pages} — ${result.total} total)`);
              const table = createTable(['ID', 'Name', 'Created']);
              for (const tmpl of result.data) {
                table.push([tmpl.id, tmpl.name || '-', formatDate(tmpl.created_at)]);
              }
              printInfo(table.toString());

              const nav: string[] = [];
              if (result.page > 1) nav.push('← prev');
              nav.push(`page ${result.page}/${result.total_pages}`);
              if (result.page < result.total_pages) nav.push('next →');
              printInfo(nav.join('  ') + '   (use --page N to jump)');
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command(
        'update <id>',
        'Update a template',
        (yy) =>
          yy
            .positional('id', { type: 'string', demandOption: true })
            .option('name', { type: 'string', describe: 'New template name' })
            .option('file', { type: 'string', array: true, describe: 'New template file(s)' }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            createApiClient({
              profile: argv.profile as string,
              testMode: argv.testMode as boolean,
              debug: argv.debug as boolean,
            });

            const spin = spinner('Updating template...');

            const payload: Partial<templatesApi.CreateTemplatePayload> = {};
            if (argv.name) payload.name = argv.name as string;
            if (argv.file) {
              payload.files = await resolveFiles(argv.file as string[]);
            }

            const template = await templatesApi.updateTemplate(argv.id as string, payload);
            spin.succeed('Template updated');

            if (isJsonMode()) {
              printJson(template);
            } else {
              printSuccess(`Template ${argv.id} updated`);
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command(
        'delete <id>',
        'Delete a template',
        (yy) =>
          yy
            .positional('id', { type: 'string', demandOption: true })
            .option('confirm', { type: 'boolean', describe: 'Skip confirmation' }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            if (!argv.confirm) {
              const autoConfirm = process.env.SIGNWELL_AUTO_CONFIRM === 'true';
              if (!autoConfirm) {
                const { default: inquirer } = await import('inquirer');
                const answers = await inquirer.prompt([
                  {
                    type: 'confirm',
                    name: 'proceed',
                    message: `Delete template ${argv.id}? This cannot be undone.`,
                    default: false,
                  },
                ]);
                if (!answers.proceed) {
                  printInfo('Cancelled');
                  return;
                }
              }
            }

            createApiClient({
              profile: argv.profile as string,
              testMode: argv.testMode as boolean,
              debug: argv.debug as boolean,
            });

            const spin = spinner('Deleting template...');
            await templatesApi.deleteTemplate(argv.id as string);
            spin.succeed('Template deleted');

            if (isJsonMode()) {
              printJson({ id: argv.id, deleted: true });
            } else {
              printSuccess(`Template ${argv.id} deleted`);
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command(
        'use <id>',
        'Create a draft document from a template',
        (yy) =>
          yy
            .positional('id', { type: 'string', demandOption: true })
            .option('recipient', { type: 'string', array: true, demandOption: true, describe: '"placeholder:email:name" or "email:name"' })
            .option('field', { type: 'string', array: true, describe: 'Pre-fill field as "key=value"' })
            .option('subject', { type: 'string', describe: 'Email subject override' })
            .option('message', { type: 'string', describe: 'Email message override' })
            .option('send', { type: 'boolean', describe: 'Create as draft, then send' })
            .option('draft', { type: 'boolean', describe: 'Create as draft (default)' }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            const shouldSend = !!argv.send;
            if (shouldSend && argv.draft) {
              throw new UsageError('Cannot use --send and --draft together');
            }

            createApiClient({
              profile: argv.profile as string,
              testMode: argv.testMode as boolean,
              debug: argv.debug as boolean,
            });

            const spin = spinner('Creating document from template...');

            const recipients = (argv.recipient as string[]).map((spec) => {
              const parts = spec.split(':');
              if (parts.length >= 3) {
                return {
                  placeholder_name: parts[0],
                  email: parts[1],
                  name: parts[2],
                };
              }
              return {
                email: parts[0],
                name: parts[1] || undefined,
              };
            });

            const fields = (argv.field as string[] | undefined)?.map((spec) => {
              const [apiId, ...rest] = spec.split('=');
              return { api_id: apiId, value: rest.join('=') };
            });

            const doc = await docsApi.createDocumentFromTemplate({
              template_ids: [argv.id as string],
              recipients,
              template_fields: fields,
              subject: argv.subject as string | undefined,
              message: argv.message as string | undefined,
              draft: true,
            });

            let outputDoc = doc;
            if (shouldSend) {
              spin.text = 'Sending document...';
              outputDoc = await docsApi.sendDocument(doc.id);
            }

            spin.succeed(shouldSend ? 'Document sent from template' : 'Draft created from template');

            if (isJsonMode()) {
              printJson(outputDoc);
            } else {
              printInfo(`Document ID: ${outputDoc.id}`);
              printInfo(`Name: ${outputDoc.name}`);
              if (outputDoc.recipients) {
                for (const r of outputDoc.recipients) {
                  printInfo(`  ${r.name || r.email}: ${r.signing_url || '-'}`);
                }
              }
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .demandCommand(1, 'Please specify a subcommand'),
  );
}
