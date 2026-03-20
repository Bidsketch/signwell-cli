import http from 'node:http';
import crypto from 'node:crypto';
import type { Argv } from 'yargs';
import { createApiClient } from '../api/client.js';
import * as webhooksApi from '../api/webhooks.js';
import {
  setOutputMode,
  printJson,
  printSuccess,
  printError,
  printInfo,
  spinner,
  createTable,
  isJsonMode,
  handleOutputError,
} from '../lib/output.js';

export function registerWebhooksCommand(yargs: Argv): Argv {
  return yargs.command('webhooks', 'Manage webhooks', (y) =>
    y
      .command(
        'list',
        'List all webhooks',
        (yy) => yy,
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            createApiClient({
              profile: argv.profile as string,
              testMode: argv.testMode as boolean,
              debug: argv.debug as boolean,
            });

            const spin = spinner('Fetching webhooks...');
            const webhooks = await webhooksApi.listWebhooks();
            spin.succeed('Webhooks retrieved');

            if (isJsonMode()) {
              printJson(webhooks);
            } else {
              if (webhooks.length === 0) {
                printInfo('No webhooks configured.');
                return;
              }

              const table = createTable(['ID', 'URL', 'Events']);
              for (const wh of webhooks) {
                table.push([
                  wh.id,
                  wh.url,
                  wh.event_types?.join(', ') || 'all',
                ]);
              }
              printInfo(table.toString());
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command(
        'create',
        'Create a webhook',
        (yy) =>
          yy
            .option('url', { type: 'string', demandOption: true, describe: 'Webhook URL' })
            .option('event', { type: 'string', array: true, describe: 'Event type(s) to listen for' }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            createApiClient({
              profile: argv.profile as string,
              testMode: argv.testMode as boolean,
              debug: argv.debug as boolean,
            });

            const spin = spinner('Creating webhook...');
            const webhook = await webhooksApi.createWebhook({
              url: argv.url as string,
              event_types: argv.event as string[] | undefined,
            });
            spin.succeed('Webhook created');

            if (isJsonMode()) {
              printJson(webhook);
            } else {
              printSuccess(`Webhook created: ${webhook.id}`);
              printInfo(`URL: ${webhook.url}`);
              if (webhook.secret) {
                printInfo(`Secret: ${webhook.secret}`);
              }
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command(
        'delete <id>',
        'Delete a webhook',
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
                    message: `Delete webhook ${argv.id}?`,
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

            const spin = spinner('Deleting webhook...');
            await webhooksApi.deleteWebhook(argv.id as string);
            spin.succeed('Webhook deleted');

            if (isJsonMode()) {
              printJson({ id: argv.id, deleted: true });
            } else {
              printSuccess(`Webhook ${argv.id} deleted`);
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command(
        'listen',
        'Start a local webhook listener for development',
        (yy) =>
          yy
            .option('port', { type: 'number', default: 3000, describe: 'Port to listen on' })
            .option('secret', { type: 'string', describe: 'Webhook signing secret' })
            .option('forward', { type: 'string', describe: 'Forward events to this URL' }),
        async (argv) => {
          const port = argv.port as number;
          const secret = argv.secret as string | undefined;
          const forwardUrl = argv.forward as string | undefined;

          printInfo(`Starting webhook listener on port ${port}...`);
          if (secret) printInfo(`HMAC validation enabled`);
          if (forwardUrl) printInfo(`Forwarding to ${forwardUrl}`);

          const server = http.createServer(async (req, res) => {
            if (req.method !== 'POST') {
              res.writeHead(405, { 'Content-Type': 'text/plain' });
              res.end('Method Not Allowed');
              return;
            }

            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(Buffer.from(chunk));
            }
            const body = Buffer.concat(chunks).toString('utf-8');

            // Validate HMAC if secret provided
            if (secret) {
              const signature = req.headers['x-signwell-signature'] as string;
              const expectedSig = crypto
                .createHmac('sha256', secret)
                .update(body)
                .digest('hex');

              if (signature !== expectedSig) {
                printError(`Invalid signature: ${signature}`);
                res.writeHead(401, { 'Content-Type': 'text/plain' });
                res.end('Unauthorized');
                return;
              }
            }

            const timestamp = new Date().toISOString();
            let payload: unknown;
            try {
              payload = JSON.parse(body);
            } catch {
              payload = body;
            }

            const eventType = (payload as any)?.event_type || (payload as any)?.type || 'unknown';

            printInfo(`\n--- ${timestamp} ---`);
            printInfo(`Event: ${eventType}`);
            printInfo(JSON.stringify(payload, null, 2));

            // Forward if configured
            if (forwardUrl) {
              try {
                const { default: axios } = await import('axios');
                await axios.post(forwardUrl, payload, {
                  headers: {
                    'Content-Type': 'application/json',
                    ...(req.headers['x-signwell-signature']
                      ? { 'x-signwell-signature': req.headers['x-signwell-signature'] as string }
                      : {}),
                  },
                });
                printInfo(`Forwarded to ${forwardUrl}`);
              } catch (err) {
                printError(`Failed to forward: ${(err as Error).message}`);
              }
            }

            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK');
          });

          server.listen(port, () => {
            printSuccess(`Webhook listener running on http://localhost:${port}`);
            printInfo('Press Ctrl+C to stop');
          });
        },
      )
      .demandCommand(1, 'Please specify a subcommand'),
  );
}
