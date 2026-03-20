import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  readConfig,
  writeConfig,
  saveProfile,
  removeProfile,
  setActiveProfile,
  getActiveProfile,
  getApiKey,
  getTestMode,
  getBaseUrl,
  maskApiKey,
} from '../../src/lib/config.js';

const tmpDir = path.join(os.tmpdir(), 'signwell-test-' + Date.now());
const configPath = path.join(tmpDir, 'config.json');

beforeEach(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
  process.env.SIGNWELL_CONFIG_PATH = configPath;
  delete process.env.SIGNWELL_API_KEY;
  delete process.env.SIGNWELL_TEST_MODE;
  delete process.env.SIGNWELL_API_BASE_URL;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.SIGNWELL_CONFIG_PATH;
});

describe('config', () => {
  it('returns empty config when file does not exist', () => {
    const config = readConfig();
    expect(config.profiles).toEqual({});
    expect(config.active_profile).toBe('default');
  });

  it('reads and writes config', () => {
    const config = {
      profiles: {
        default: { api_key: 'test-key', test_mode: false },
      },
      active_profile: 'default',
    };
    writeConfig(config);
    const read = readConfig();
    expect(read).toEqual(config);
  });

  it('saves a profile', () => {
    saveProfile('staging', { api_key: 'staging-key', test_mode: true });
    const config = readConfig();
    expect(config.profiles.staging).toEqual({ api_key: 'staging-key', test_mode: true });
  });

  it('removes a profile', () => {
    saveProfile('default', { api_key: 'key1', test_mode: false });
    saveProfile('staging', { api_key: 'key2', test_mode: true });
    const removed = removeProfile('staging');
    expect(removed).toBe(true);
    const config = readConfig();
    expect(config.profiles.staging).toBeUndefined();
  });

  it('returns false when removing non-existent profile', () => {
    const removed = removeProfile('nonexistent');
    expect(removed).toBe(false);
  });

  it('switches active profile when removing active', () => {
    saveProfile('default', { api_key: 'key1', test_mode: false });
    saveProfile('staging', { api_key: 'key2', test_mode: true });
    setActiveProfile('staging');
    removeProfile('staging');
    const config = readConfig();
    expect(config.active_profile).toBe('default');
  });

  it('sets active profile', () => {
    saveProfile('default', { api_key: 'key1', test_mode: false });
    saveProfile('staging', { api_key: 'key2', test_mode: true });
    const switched = setActiveProfile('staging');
    expect(switched).toBe(true);
    const config = readConfig();
    expect(config.active_profile).toBe('staging');
  });

  it('returns false when switching to non-existent profile', () => {
    const switched = setActiveProfile('nonexistent');
    expect(switched).toBe(false);
  });

  it('env var overrides config for API key', () => {
    saveProfile('default', { api_key: 'config-key', test_mode: false });
    process.env.SIGNWELL_API_KEY = 'env-key';
    expect(getApiKey()).toBe('env-key');
  });

  it('getApiKey returns from config when env not set', () => {
    saveProfile('default', { api_key: 'config-key', test_mode: false });
    expect(getApiKey()).toBe('config-key');
  });

  it('getApiKey returns null when no config and no env', () => {
    expect(getApiKey()).toBeNull();
  });

  it('env var overrides test mode', () => {
    process.env.SIGNWELL_TEST_MODE = 'true';
    expect(getTestMode()).toBe(true);
  });

  it('flag overrides test mode', () => {
    expect(getTestMode(undefined, true)).toBe(true);
  });

  it('getBaseUrl returns default', () => {
    expect(getBaseUrl()).toBe('https://www.signwell.com/api/v1');
  });

  it('getBaseUrl uses env override', () => {
    process.env.SIGNWELL_API_BASE_URL = 'https://custom.api.com/v1';
    expect(getBaseUrl()).toBe('https://custom.api.com/v1');
    delete process.env.SIGNWELL_API_BASE_URL;
  });

  it('masks API key correctly', () => {
    expect(maskApiKey('abcdefghijklmnop')).toBe('abcd****mnop');
    expect(maskApiKey('short')).toBe('****');
  });
});
