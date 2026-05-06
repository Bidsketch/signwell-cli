import fs from 'node:fs';
import type { Argv } from 'yargs';
import { createApiClient } from '../api/client.js';
import * as docsApi from '../api/documents.js';
import { resolveFiles } from '../lib/upload.js';
import { paginate } from '../lib/pagination.js';
import { CliError, UsageError } from '../lib/errors.js';
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

function parseRecipient(spec: string): { email: string; name?: string; embedded?: boolean } {
  const parts = spec.split(':');
  const email = parts[0];
  const name = parts[1] || undefined;
  const embedded = parts[2] === 'embedded';
  return { email, name, embedded };
}

export function registerDocumentsCommand(yargs: Argv): Argv {
  return yargs.command('documents', 'Manage documents', (y) =>
    y
      .command(
        'create',
        'Create a new document for signing',
        (yy) =>
          yy
            .option('file', { type: 'string', array: true, describe: 'Local file path(s)' })
            .option('file-url', { type: 'string', array: true, describe: 'Remote file URL(s)' })
            .option('file-b64', { type: 'string', describe: 'Path to base64-encoded file' })
            .option('file-b64-name', { type: 'string', describe: 'Filename for base64 upload' })
            .option('name', { type: 'string', describe: 'Document name' })
            .option('recipient', { type: 'string', array: true, demandOption: true, describe: 'Recipient(s) as "email:name" or "email:name:embedded"' })
            .option('subject', { type: 'string', describe: 'Email subject line' })
            .option('message', { type: 'string', describe: 'Email message body' })
            .option('draft', { type: 'boolean', describe: 'Create as draft (default)' })
            .option('send', { type: 'boolean', describe: 'Send after creation; requires --text-tags for file uploads' })
            .option('text-tags', { type: 'boolean', describe: 'Enable text tag parsing before sending' })
            .option('redirect-url', { type: 'string', describe: 'Redirect URL after signing' })
            .option('signing-order', { type: 'boolean', describe: 'Enforce sequential signing order' })
            .option('expiration-days', { type: 'number', describe: 'Days until expiration' })
            .option('reminder-days', { type: 'number', array: true, describe: 'Auto-remind days' }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            const shouldSend = !!argv.send;
            const useTextTags = !!argv.textTags;

            if (shouldSend && argv.draft) {
              throw new UsageError('Cannot use --send and --draft together');
            }
            if (shouldSend && !useTextTags) {
              throw new UsageError(
                'Cannot send a file-based document without fields. Omit --send to create a draft, or add --text-tags when the file contains SignWell text tags.',
                'For most uploaded contracts, create a draft first and add fields in SignWell.',
              );
            }

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

            spin.text = 'Creating document...';

            const recipients = (argv.recipient as string[]).map(parseRecipient);
            const docName = (argv.name as string) || files[0]?.name || 'Untitled';

            let hasEmbedded = false;
            const mappedRecipients = recipients.map((r, i) => {
              if (r.embedded) hasEmbedded = true;
              return {
                email: r.email,
                name: r.name,
                ...(argv.signingOrder ? { signing_order: i + 1 } : {}),
              };
            });

            const doc = await docsApi.createDocument({
              name: docName,
              subject: argv.subject as string | undefined,
              message: argv.message as string | undefined,
              draft: true,
              text_tags: useTextTags ? true : undefined,
              redirect_url: argv.redirectUrl as string | undefined,
              apply_signing_order: argv.signingOrder as boolean | undefined,
              embedded_signing: hasEmbedded ? true : undefined,
              expires_in: argv.expirationDays as number | undefined,
              reminders: argv.reminderDays as number[] | undefined,
              files,
              recipients: mappedRecipients,
            });

            let outputDoc = doc;
            if (shouldSend) {
              spin.text = 'Sending document...';
              outputDoc = await docsApi.sendDocument(doc.id);
            }
            spin.succeed(shouldSend ? 'Document sent' : 'Draft created');

            if (isJsonMode()) {
              printJson(outputDoc);
            } else {
              printInfo(`Document ID: ${outputDoc.id}`);
              printInfo(`Name: ${outputDoc.name}`);
              printInfo(`Status: ${statusColor(outputDoc.status)}`);

              if (outputDoc.recipients) {
                for (const r of outputDoc.recipients) {
                  printInfo(`  ${r.name || r.email}: ${r.signing_url || '-'}`);
                  if (r.embedded_signing_url) {
                    printInfo(`  Embedded URL: ${r.embedded_signing_url}`);
                  }
                }
              }
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command(
        'get <id>',
        'Get document details',
        (yy) => yy.positional('id', { type: 'string', demandOption: true }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            createApiClient({
              profile: argv.profile as string,
              testMode: argv.testMode as boolean,
              debug: argv.debug as boolean,
            });

            const spin = spinner('Fetching document...');
            const doc = await docsApi.getDocument(argv.id as string);
            spin.succeed('Document retrieved');

            if (isJsonMode()) {
              printJson(doc);
            } else {
              printInfo(`Document: ${doc.name} (${doc.id})`);
              printInfo(`Status: ${statusColor(doc.status)}`);
              printInfo(`Created: ${formatDate(doc.created_at)}`);

              if (doc.recipients && doc.recipients.length > 0) {
                const table = createTable(['Email', 'Name', 'Status', 'Signed At']);
                for (const r of doc.recipients) {
                  table.push([
                    r.email,
                    r.name || '-',
                    statusColor(r.status),
                    r.signed_at ? formatDate(r.signed_at) : '-',
                  ]);
                }
                printInfo('\nRecipients:');
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
        'List documents',
        (yy) =>
          yy
            .option('page', { type: 'number', default: 1 })
            .option('per-page', { type: 'number', default: 20 })
            .option('status', { type: 'string', describe: 'Filter by status' })
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
                docsApi.listDocuments({
                  page,
                  per_page: perPage,
                  status: argv.status as string | undefined,
                });

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
                  const doc = d as { id: string; name: string; status: string; created_at: string };
                  table.push([
                    doc.id,
                    doc.name || '-',
                    statusColor(doc.status),
                    formatDate(doc.created_at),
                  ]);
                }
                printInfo(table.toString());
              }
              return;
            }

            const spin = spinner('Fetching documents...');
            const result = await docsApi.listDocuments({
              page: argv.page,
              per_page: argv.perPage,
              status: argv.status as string | undefined,
            });
            spin.succeed('Documents retrieved');

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
              printInfo(`Documents (page ${result.page} of ${result.total_pages} — ${result.total} total)`);
              const table = createTable(['ID', 'Name', 'Status', 'Created']);
              for (const doc of result.data) {
                table.push([
                  doc.id,
                  doc.name || '-',
                  statusColor(doc.status),
                  formatDate(doc.created_at),
                ]);
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
        'send <id>',
        'Send a draft document',
        (yy) => yy.positional('id', { type: 'string', demandOption: true }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            createApiClient({
              profile: argv.profile as string,
              testMode: argv.testMode as boolean,
              debug: argv.debug as boolean,
            });

            const spin = spinner('Sending document...');
            const doc = await docsApi.sendDocument(argv.id as string);
            spin.succeed('Document sent');

            if (isJsonMode()) {
              printJson(doc);
            } else {
              printSuccess(`Document ${argv.id} sent successfully`);
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command(
        'remind <id>',
        'Send a reminder to pending signers',
        (yy) => yy.positional('id', { type: 'string', demandOption: true }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            createApiClient({
              profile: argv.profile as string,
              testMode: argv.testMode as boolean,
              debug: argv.debug as boolean,
            });

            const spin = spinner('Sending reminder...');
            await docsApi.remindDocument(argv.id as string);
            spin.succeed('Reminder sent');

            if (isJsonMode()) {
              printJson({ id: argv.id, reminded: true });
            } else {
              printSuccess(`Reminder sent for document ${argv.id}`);
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command(
        'download <id>',
        'Download completed PDF',
        (yy) =>
          yy
            .positional('id', { type: 'string', demandOption: true })
            .option('output', { type: 'string', alias: 'o', describe: 'Output file path' })
            .option('open', { type: 'boolean', describe: 'Open after download' }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            createApiClient({
              profile: argv.profile as string,
              testMode: argv.testMode as boolean,
              debug: argv.debug as boolean,
              timeout: 120000,
            });

            const spin = spinner('Downloading document...');

            // Get document info for default filename
            const doc = await docsApi.getDocument(argv.id as string);

            if (doc.status.toLowerCase() !== 'completed') {
              if (!isJsonMode()) {
                spin.fail('Document not yet completed');
              }
              throw new CliError(
                `Document status is '${doc.status}'. Only completed documents can be downloaded.`,
                1,
                'Check the document later or use `sw documents get <id>` for the current status.',
              );
            }

            const buffer = await docsApi.downloadDocument(argv.id as string);
            const outputPath = (argv.output as string) ||
              `${(doc.name || argv.id).replace(/[^a-zA-Z0-9._-]/g, '_')}-signed.pdf`;

            fs.writeFileSync(outputPath, buffer);
            spin.succeed(`Downloaded to ${outputPath}`);

            if (argv.open) {
              const { exec } = await import('node:child_process');
              const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
              exec(`${cmd} "${outputPath}"`);
            }

            if (isJsonMode()) {
              printJson({ id: argv.id, output: outputPath, size: buffer.length });
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command(
        'delete <id>',
        'Delete a document',
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
                    message: `Delete document ${argv.id}? This cannot be undone.`,
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

            const spin = spinner('Deleting document...');
            await docsApi.deleteDocument(argv.id as string);
            spin.succeed('Document deleted');

            if (isJsonMode()) {
              printJson({ id: argv.id, deleted: true });
            } else {
              printSuccess(`Document ${argv.id} deleted`);
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command('recipients', 'Manage document recipients', (yy) =>
        yy.command(
          'update <id>',
          'Update recipient on a document',
          (yyy) =>
            yyy
              .positional('id', { type: 'string', demandOption: true })
              .option('recipient', {
                type: 'string',
                array: true,
                demandOption: true,
                describe: '"old_email:new_email:New Name"',
              }),
          async (argv) => {
            setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
            try {
              createApiClient({
                profile: argv.profile as string,
                testMode: argv.testMode as boolean,
                debug: argv.debug as boolean,
              });

              const recipients = (argv.recipient as string[]).map((spec) => {
                const parts = spec.split(':');
                return {
                  old_email: parts[0],
                  new_email: parts[1],
                  new_name: parts[2] || undefined,
                };
              });

              const spin = spinner('Updating recipients...');
              const doc = await docsApi.updateRecipients(argv.id as string, recipients);
              spin.succeed('Recipients updated');

              if (isJsonMode()) {
                printJson(doc);
              } else {
                printSuccess(`Recipients updated for document ${argv.id}`);
              }
            } catch (err) {
              handleOutputError(err);
            }
          },
        ).demandCommand(1),
      )
      .demandCommand(1, 'Please specify a subcommand'),
  );
}
