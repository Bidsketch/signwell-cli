import type { Argv } from 'yargs';
import {
  readConfig,
  saveProfile,
  removeProfile,
  setActiveProfile,
  maskApiKey,
  getActiveProfile,
} from '../lib/config.js';
import {
  setOutputMode,
  printJson,
  printSuccess,
  printError,
  printInfo,
  createTable,
  isJsonMode,
  handleOutputError,
} from '../lib/output.js';
import { CliError, UsageError } from '../lib/errors.js';

export function registerProfileCommand(yargs: Argv): Argv {
  return yargs.command('profile', 'Manage configuration profiles', (y) =>
    y
      .command(
        'list',
        'List all profiles',
        (yy) => yy,
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            const config = readConfig();
            const profiles = Object.entries(config.profiles);

            if (isJsonMode()) {
              printJson(
                profiles.map(([name, p]) => ({
                  name,
                  active: name === config.active_profile,
                  api_key: maskApiKey(p.api_key),
                  test_mode: p.test_mode,
                })),
              );
              return;
            }

            if (profiles.length === 0) {
              printInfo('No profiles configured. Run `sw auth login` to get started.');
              return;
            }

            const table = createTable(['', 'Name', 'API Key', 'Test Mode']);
            for (const [name, profile] of profiles) {
              table.push([
                name === config.active_profile ? '→' : ' ',
                name,
                maskApiKey(profile.api_key),
                profile.test_mode ? 'yes' : 'no',
              ]);
            }
            printInfo(table.toString());
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command(
        'add <name>',
        'Add a new profile',
        (yy) =>
          yy
            .positional('name', { type: 'string', demandOption: true })
            .option('api-key', { type: 'string', describe: 'API key' })
            .option('test-mode', { type: 'boolean', default: false }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            let apiKey = argv.apiKey as string | undefined;

            if (!apiKey) {
              const { default: inquirer } = await import('inquirer');
              const answers = await inquirer.prompt([
                {
                  type: 'password',
                  name: 'apiKey',
                  message: 'Enter your SignWell API key:',
                  mask: '*',
                },
              ]);
              apiKey = answers.apiKey;
            }

            if (!apiKey) {
              throw new UsageError('API key is required');
            }

            saveProfile(argv.name as string, {
              api_key: apiKey,
              test_mode: argv.testMode as boolean,
            });

            if (isJsonMode()) {
              printJson({ name: argv.name, added: true });
            } else {
              printSuccess(`Profile '${argv.name}' added`);
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command(
        'use <name>',
        'Switch active profile',
        (yy) => yy.positional('name', { type: 'string', demandOption: true }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            const switched = setActiveProfile(argv.name as string);
            if (switched) {
              if (isJsonMode()) {
                printJson({ active_profile: argv.name });
              } else {
                printSuccess(`Switched to profile: ${argv.name}`);
              }
            } else {
              throw new CliError(`Profile not found: ${argv.name}`);
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command(
        'remove <name>',
        'Remove a profile',
        (yy) =>
          yy
            .positional('name', { type: 'string', demandOption: true })
            .option('confirm', { type: 'boolean', describe: 'Skip confirmation' }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            const config = readConfig();
            const name = argv.name as string;

            if (name === config.active_profile && !argv.confirm) {
              const autoConfirm = process.env.SIGNWELL_AUTO_CONFIRM === 'true';
              if (!autoConfirm) {
                const { default: inquirer } = await import('inquirer');
                const answers = await inquirer.prompt([
                  {
                    type: 'confirm',
                    name: 'proceed',
                    message: `'${name}' is the active profile. Remove it?`,
                    default: false,
                  },
                ]);
                if (!answers.proceed) {
                  printInfo('Cancelled');
                  return;
                }
              }
            }

            const removed = removeProfile(name);
            if (removed) {
              if (isJsonMode()) {
                printJson({ name, removed: true });
              } else {
                printSuccess(`Profile '${name}' removed`);
              }
            } else {
              throw new CliError(`Profile not found: ${name}`);
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command(
        'show <name>',
        'Show profile details',
        (yy) => yy.positional('name', { type: 'string', demandOption: true }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            const config = readConfig();
            const name = argv.name as string;
            const profile = config.profiles[name];

            if (!profile) {
              throw new CliError(`Profile not found: ${name}`);
            }

            if (isJsonMode()) {
              printJson({
                name,
                active: name === config.active_profile,
                api_key: maskApiKey(profile.api_key),
                test_mode: profile.test_mode,
              });
            } else {
              printInfo(`Name: ${name}`);
              printInfo(`Active: ${name === config.active_profile ? 'yes' : 'no'}`);
              printInfo(`API Key: ${maskApiKey(profile.api_key)}`);
              printInfo(`Test Mode: ${profile.test_mode ? 'enabled' : 'disabled'}`);
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .demandCommand(1, 'Please specify a subcommand: list, add, use, remove, or show'),
  );
}
