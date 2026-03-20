import type { Argv } from 'yargs';
import fs from 'node:fs';
import { createApiClient } from '../api/client.js';
import * as templatesApi from '../api/templates.js';
import * as docsApi from '../api/documents.js';
import { resolveFiles } from '../lib/upload.js';
import { paginate } from '../lib/pagination.js';
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

export function registerTemplatesCommand(yargs: Argv): Argv {
  return yargs.command('templates', 'Manage templates', (y) =>
    y
      .command(
        'create',
        'Create a new template',
        (yy) =>
          yy
            .option('file', { type: 'string', array: true, demandOption: true, describe: 'Template file(s)' })
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
            const files = await resolveFiles(argv.file as string[]);

            spin.text = 'Creating template...';

            const placeholders = (argv.placeholder as string[] | undefined)?.map((spec) => {
              const parts = spec.split(':');
              return { name: parts[0], email: parts[1] || undefined };
            });

            let fields: unknown[] | undefined;
            if (argv.fields) {
              const fieldsContent = fs.readFileSync(argv.fields as string, 'utf-8');
              fields = JSON.parse(fieldsContent);
            } else if (placeholders && placeholders.length > 0) {
              // Auto-generate a default signature field per placeholder
              fields = placeholders.map((p, i) => ({
                x: 10,
                y: 10 + (i * 50),
                page: 1,
                type: 'signature',
                required: true,
                placeholder_id: `placeholder_${i + 1}`,
                width: 200,
                height: 40,
              }));
            }

            const template = await templatesApi.createTemplate({
              name: argv.name as string,
              text_tags: argv.textTags as boolean | undefined,
              files,
              placeholders,
              fields,
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
              const spin = spinner('Fetching all templates...');
              const fetcher = (page: number, perPage: number) =>
                templatesApi.listTemplates({ page, per_page: perPage });

              const items: unknown[] = [];

              for await (const tmpl of paginate(fetcher, {
                perPage: 100,
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
            const result = await templatesApi.listTemplates({
              page: argv.page,
              per_page: argv.perPage,
            });
            spin.succeed('Templates retrieved');

            if (isJsonMode()) {
              printJson(result.data, {
                count: result.data.length,
                total: result.total,
                page: result.page,
                per_page: result.per_page,
                total_pages: result.total_pages,
              });
            } else {
              printInfo(`Templates (page ${result.page} of ${result.total_pages} — ${result.total} total)`);
              const table = createTable(['ID', 'Name', 'Created']);
              for (const tmpl of result.data) {
                table.push([tmpl.id, tmpl.name || '-', formatDate(tmpl.created_at)]);
              }
              printInfo(table.toString());
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
        'Create a document from a template',
        (yy) =>
          yy
            .positional('id', { type: 'string', demandOption: true })
            .option('recipient', { type: 'string', array: true, demandOption: true, describe: '"placeholder:email:name" or "email:name"' })
            .option('field', { type: 'string', array: true, describe: 'Pre-fill field as "key=value"' })
            .option('subject', { type: 'string', describe: 'Email subject override' })
            .option('message', { type: 'string', describe: 'Email message override' })
            .option('send', { type: 'boolean', describe: 'Send immediately' })
            .option('draft', { type: 'boolean', describe: 'Create as draft' }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
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
              const [name, ...rest] = spec.split('=');
              return { name, value: rest.join('=') };
            });

            const doc = await docsApi.createDocumentFromTemplate({
              template_ids: [argv.id as string],
              recipients,
              fields,
              subject: argv.subject as string | undefined,
              message: argv.message as string | undefined,
              draft: argv.send ? true : argv.draft as boolean | undefined,
            });

            let result = doc;
            if (argv.send && !argv.draft) {
              spin.text = 'Sending document...';
              result = await docsApi.sendDocument(doc.id);
              spin.succeed('Document created from template and sent');
            } else {
              spin.succeed('Document created from template');
            }

            if (isJsonMode()) {
              printJson(result);
            } else {
              printInfo(`Document ID: ${result.id}`);
              printInfo(`Name: ${result.name}`);
              if (result.recipients) {
                for (const r of result.recipients) {
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
