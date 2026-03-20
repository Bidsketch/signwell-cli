import type { Argv } from 'yargs';
import { createApiClient } from '../api/client.js';
import { getMe } from '../api/me.js';
import {
  setOutputMode,
  printJson,
  printInfo,
  spinner,
  createTable,
  isJsonMode,
  handleOutputError,
} from '../lib/output.js';

export function registerMeCommand(yargs: Argv): Argv {
  return yargs.command(
    'me',
    'Show current account information',
    (y) => y,
    async (argv) => {
      setOutputMode({ json: argv.json as boolean, quiet: argv.quiet as boolean });
      try {
        createApiClient({
          profile: argv.profile as string,
          testMode: argv.testMode as boolean,
          debug: argv.debug as boolean,
        });

        const spin = spinner('Fetching account info...');
        const me = await getMe();
        spin.succeed('Account info retrieved');

        if (isJsonMode()) {
          printJson(me);
        } else {
          const table = createTable(['Field', 'Value']);
          table.push(
            ['Name', me.user.name || '-'],
            ['Email', me.user.email || '-'],
            ['Role', me.role || '-'],
            ['Account', me.account.name || '-'],
            ['Plan', me.account.plan_tier || '-'],
          );
          printInfo(table.toString());
        }
      } catch (err) {
        handleOutputError(err);
      }
    },
  );
}
