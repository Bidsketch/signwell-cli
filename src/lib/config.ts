import fs from 'node:fs';
import path from 'node:path';
import type { Config, ApiProfile } from '../types/api.js';

export interface CredentialWarning {
  code: string;
  message: string;
}

export interface EnvApiKeyStatus {
  envApiKeySet: boolean;
  envApiKeyConflict: boolean;
  envApiKeyIgnored: boolean;
  profileName: string;
  profile: ApiProfile | null;
  warning: CredentialWarning | null;
}

function getConfigPath(): string {
  if (process.env.SIGNWELL_CONFIG_PATH) {
    return process.env.SIGNWELL_CONFIG_PATH;
  }
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.signwell', 'config.json');
}

function ensureConfigDir(): void {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function readConfig(): Config {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return { profiles: {}, active_profile: 'default' };
  }
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as Config;
  } catch {
    return { profiles: {}, active_profile: 'default' };
  }
}

export function writeConfig(config: Config): void {
  ensureConfigDir();
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

function getConfiguredProfile(profileName?: string): { name: string; profile: ApiProfile | null } {
  const config = readConfig();
  const name = profileName || config.active_profile || 'default';
  return { name, profile: config.profiles[name] || null };
}

export function getActiveProfile(profileName?: string): ApiProfile | null {
  return getConfiguredProfile(profileName).profile;
}

export function getApiKey(profileName?: string): string | null {
  const profile = getActiveProfile(profileName);
  return profile?.api_key || null;
}

export function getEnvApiKeyStatus(profileName?: string): EnvApiKeyStatus {
  const { name, profile } = getConfiguredProfile(profileName);
  const envApiKey = process.env.SIGNWELL_API_KEY;
  const envApiKeySet = !!envApiKey;
  let envApiKeyConflict = false;
  let envApiKeyIgnored = false;
  let warning: CredentialWarning | null = null;

  if (envApiKeySet) {
    if (profile) {
      envApiKeyConflict = profile.api_key !== envApiKey;
      envApiKeyIgnored = envApiKeyConflict;
      if (envApiKeyConflict) {
        warning = {
          code: 'SIGNWELL_API_KEY_IGNORED',
          message: `SIGNWELL_API_KEY is set but ignored; using credentials from profile "${name}".`,
        };
      }
    } else {
      envApiKeyIgnored = true;
      warning = {
        code: 'SIGNWELL_API_KEY_IGNORED',
        message: `SIGNWELL_API_KEY is set but ignored because profile "${name}" is not configured. Run \`sw auth login\` to authenticate.`,
      };
    }
  }

  return {
    envApiKeySet,
    envApiKeyConflict,
    envApiKeyIgnored,
    profileName: name,
    profile,
    warning,
  };
}

export function getTestMode(profileName?: string, flagTestMode?: boolean): boolean {
  if (process.env.SIGNWELL_TEST_MODE === 'true') return true;
  if (flagTestMode) return true;
  const profile = getActiveProfile(profileName);
  return profile?.test_mode || false;
}

export function getBaseUrl(): string {
  return process.env.SIGNWELL_API_BASE_URL || 'https://www.signwell.com/api/v1';
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

export function saveProfile(name: string, profile: ApiProfile): void {
  const config = readConfig();
  config.profiles[name] = profile;
  if (!config.active_profile) {
    config.active_profile = name;
  }
  writeConfig(config);
}

export function removeProfile(name: string): boolean {
  const config = readConfig();
  if (!config.profiles[name]) return false;
  delete config.profiles[name];
  if (config.active_profile === name) {
    const remaining = Object.keys(config.profiles);
    config.active_profile = remaining[0] || 'default';
  }
  writeConfig(config);
  return true;
}

export function setActiveProfile(name: string): boolean {
  const config = readConfig();
  if (!config.profiles[name]) return false;
  config.active_profile = name;
  writeConfig(config);
  return true;
}
