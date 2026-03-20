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
import { setOutputMode } from './lib/output.js';

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
      noColor: argv.noColor,
    });
  })
  .version()
  .help()
  .alias('h', 'help')
  .strict()
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
