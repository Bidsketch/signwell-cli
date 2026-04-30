import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { registerAuthCommand } from './commands/auth.js';
import { registerMeCommand } from './commands/me.js';
import { registerProfileCommand } from './commands/profile.js';
import { registerDocumentsCommand } from './commands/documents.js';
import { registerTemplatesCommand } from './commands/templates.js';
import { registerBulkSendCommand } from './commands/bulk-send.js';
import { registerWebhooksCommand } from './commands/webhooks.js';
import { registerSchemaCommand } from './commands/schema.js';
import { registerSkillsCommand } from './commands/skills.js';
import { printError, printErrorJson, setOutputMode } from './lib/output.js';

function hasRawFlag(args: string[], flag: string): boolean {
  return args.some((arg) => arg === `--${flag}` || arg.startsWith(`--${flag}=`));
}

function configureOutputFromRawArgs(): { json: boolean; quiet: boolean; noColor: boolean } {
  const args = hideBin(process.argv);
  const output = {
    json: hasRawFlag(args, 'json'),
    quiet: hasRawFlag(args, 'quiet'),
    noColor: args.includes('--no-color') || process.env.NO_COLOR !== undefined,
  };
  setOutputMode(output);
  return output;
}

const cli = yargs(hideBin(process.argv))
  .scriptName('sw')
  .usage('$0 <command> [options]')
  .option('profile', {
    type: 'string',
    describe: 'Use named profile from config',
    global: true,
  })
  .option('json', {
    type: 'boolean',
    describe: 'Output raw JSON (machine-readable)',
    default: false,
    global: true,
  })
  .option('quiet', {
    type: 'boolean',
    describe: 'Suppress all output except errors',
    default: false,
    global: true,
  })
  .option('no-color', {
    type: 'boolean',
    describe: 'Disable ANSI colors',
    default: false,
    global: true,
  })
  .option('test-mode', {
    type: 'boolean',
    describe: 'Set test_mode: true on API requests',
    default: false,
    global: true,
  })
  .option('debug', {
    type: 'boolean',
    describe: 'Log HTTP requests/responses to stderr',
    default: false,
    global: true,
  })
  .middleware((argv) => {
    setOutputMode({
      json: argv.json,
      quiet: argv.quiet,
      noColor: process.env.NO_COLOR !== undefined ||
        (argv as Record<string, unknown>).color === false ||
        argv.noColor === true,
    });
  })
  .version()
  .help()
  .alias('h', 'help')
  .strict()
  .strictCommands()
  .strictOptions()
  .fail((message, err, y) => {
    const output = configureOutputFromRawArgs();
    const errorMessage = err?.message || message || 'Invalid command';
    const hint = 'Run `sw --help` for available commands and usage.';

    if (output.json) {
      printErrorJson({
        code: 'USAGE_ERROR',
        message: errorMessage,
        hint,
        http_status: 0,
      });
    } else {
      if (!output.quiet) {
        y.showHelp('error');
        process.stderr.write('\n');
      }
      printError(errorMessage, hint);
    }

    process.exit(2);
  })
  .demandCommand(1, 'Please specify a command. Run `sw --help` for available commands.');

// Register all command groups
registerAuthCommand(cli);
registerMeCommand(cli);
registerProfileCommand(cli);
registerDocumentsCommand(cli);
registerTemplatesCommand(cli);
registerBulkSendCommand(cli);
registerWebhooksCommand(cli);
registerSchemaCommand(cli);
registerSkillsCommand(cli);

cli.parse();
