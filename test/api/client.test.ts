import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import nock from 'nock';
import { createApiClient, resetClient, SIGNWELL_USER_AGENT } from '../../src/api/client.js';
import { removeProfile, saveProfile } from '../../src/lib/config.js';
import { AuthError } from '../../src/lib/errors.js';
import { clearWarnings, setOutputMode } from '../../src/lib/output.js';

const BASE_URL = 'https://www.signwell.com/api/v1';
const tmpDir = path.join(os.tmpdir(), 'signwell-client-test-' + Date.now());
const configPath = path.join(tmpDir, 'config.json');
const packageJson = JSON.parse(
  fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
) as { version: string };

beforeEach(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
  resetClient();
  clearWarnings();
  setOutputMode({ json: false, quiet: true });
  process.env.SIGNWELL_CONFIG_PATH = configPath;
  process.env.SIGNWELL_API_KEY = 'test-api-key';
  process.env.SIGNWELL_API_BASE_URL = BASE_URL;
});

afterEach(() => {
  nock.cleanAll();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  resetClient();
  clearWarnings();
  setOutputMode({ json: false, quiet: false });
  delete process.env.SIGNWELL_CONFIG_PATH;
  delete process.env.SIGNWELL_API_KEY;
  delete process.env.SIGNWELL_API_BASE_URL;
  delete process.env.SIGNWELL_TEST_MODE;
});

describe('api client', () => {
  it('honors SIGNWELL_TEST_MODE=true even when testMode option is false', async () => {
    process.env.SIGNWELL_TEST_MODE = 'true';

    const scope = nock(BASE_URL)
      .post('/documents', (body: any) =>
        body.name === 'Service Agreement' && body.test_mode === true,
      )
      .reply(200, { ok: true });

    const client = createApiClient({
      apiKey: 'test-api-key',
      baseUrl: BASE_URL,
      testMode: false,
      retries: 0,
    });

    await client.post('/documents', { name: 'Service Agreement' });

    expect(scope.isDone()).toBe(true);
  });

  it('sends the CLI user agent with API requests', async () => {
    const scope = nock(BASE_URL)
      .matchHeader('User-Agent', SIGNWELL_USER_AGENT)
      .get('/me')
      .reply(200, { ok: true });

    const client = createApiClient({
      apiKey: 'test-api-key',
      baseUrl: BASE_URL,
      retries: 0,
    });
    await client.get('/me');

    expect(SIGNWELL_USER_AGENT).toBe(`signwell-cli/${packageJson.version}`);
    expect(scope.isDone()).toBe(true);
  });

  it('uses the configured profile key instead of SIGNWELL_API_KEY for implicit auth', async () => {
    saveProfile('default', { api_key: 'profile-key', test_mode: false });
    process.env.SIGNWELL_API_KEY = 'env-key';

    const scope = nock(BASE_URL)
      .matchHeader('X-Api-Key', 'profile-key')
      .get('/me')
      .reply(200, { ok: true });

    const client = createApiClient({ baseUrl: BASE_URL, retries: 0 });
    await client.get('/me');

    expect(scope.isDone()).toBe(true);
  });

  it('throws AuthError when only SIGNWELL_API_KEY is set', () => {
    expect(() => createApiClient({ baseUrl: BASE_URL, retries: 0 })).toThrow(AuthError);
  });

  it('does not fall back to SIGNWELL_API_KEY after removing the active profile', () => {
    saveProfile('default', { api_key: 'profile-key', test_mode: false });
    expect(removeProfile('default')).toBe(true);

    expect(() => createApiClient({ baseUrl: BASE_URL, retries: 0 })).toThrow(AuthError);
  });
});
