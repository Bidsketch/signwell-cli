import type { Argv } from 'yargs';
import { createApiClient, resetClient } from '../api/client.js';
import { getMe } from '../api/me.js';
import {
  readConfig,
  saveProfile,
  removeProfile,
  getActiveProfile,
  maskApiKey,
  getTestMode,
} from '../lib/config.js';
import {
  setOutputMode,
  printJson,
  printSuccess,
  printError,
  printInfo,
  spinner,
  isJsonMode,
  handleOutputError,
} from '../lib/output.js';
import { CliError, UsageError } from '../lib/errors.js';

export function registerAuthCommand(yargs: Argv): Argv {
  return yargs.command('auth', 'Manage authentication', (y) =>
    y
      .command(
        'login',
        'Set up API credentials',
        (yy) =>
          yy
            .option('api-key', { type: 'string', describe: 'API key (non-interactive)' })
            .option('profile', { type: 'string', describe: 'Profile name', default: 'default' })
            .option('test-mode', { type: 'boolean', describe: 'Enable test mode', default: false }),
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

            const spin = spinner('Validating API key...');

            resetClient();
            createApiClient({
              apiKey,
              testMode: argv.testMode as boolean,
            });

            const me = await getMe({ apiKey });

            spin.succeed('API key validated');

            const profileName = (argv.profile as string) || 'default';
            saveProfile(profileName, {
              api_key: apiKey,
              test_mode: argv.testMode as boolean,
            });

            if (isJsonMode()) {
              printJson({ name: me.user.name, email: me.user.email, profile: profileName });
            } else {
              printSuccess(`Logged in as ${me.user.name} (${me.user.email})`);
              printInfo(`Profile: ${profileName}`);
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command(
        'logout',
        'Remove stored credentials',
        (yy) =>
          yy.option('profile', { type: 'string', describe: 'Profile to remove' }),
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            const config = readConfig();
            const profileName = (argv.profile as string) || config.active_profile || 'default';

            const removed = removeProfile(profileName);
            if (removed) {
              if (isJsonMode()) {
                printJson({ removed: profileName });
              } else {
                printSuccess(`Removed profile: ${profileName}`);
              }
            } else {
              throw new CliError(`Profile not found: ${profileName}`);
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .command(
        'status',
        'Show current authentication status',
        (yy) => yy,
        async (argv) => {
          setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
          try {
            const config = readConfig();
            const profileName = (argv.profile as string) || config.active_profile || 'default';
            const profile = getActiveProfile(profileName);

            if (!profile) {
              if (isJsonMode()) {
                printJson({ authenticated: false, profile: profileName });
              } else {
                printError('Not authenticated. Run `sw auth login`');
              }
              process.exit(3);
            }

            const masked = maskApiKey(profile.api_key);
            const testMode = getTestMode(profileName);

            if (isJsonMode()) {
              printJson({
                authenticated: true,
                profile: profileName,
                api_key: masked,
                test_mode: testMode,
              });
            } else {
              printInfo(`Profile: ${profileName}`);
              printInfo(`API Key: ${masked}`);
              printInfo(`Test Mode: ${testMode ? 'enabled' : 'disabled'}`);
            }
          } catch (err) {
            handleOutputError(err);
          }
        },
      )
      .demandCommand(1, 'Please specify a subcommand: login, logout, or status'),
  );
}
