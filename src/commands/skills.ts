import type { Argv } from 'yargs';
import { resolve, dirname, relative, basename, sep } from 'path';
import { homedir, platform } from 'os';
import {
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
  symlinkSync,
  readlinkSync,
  lstatSync,
  readdirSync,
} from 'fs';
import { printSuccess, printError, printErrorJson, printInfo, printJson } from '../lib/output.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Agent Skills spec: canonical location + agent-specific symlinks
// Matches the behavior of `npx skills add`
interface AgentConfig {
  name: string;
  displayName: string;
  globalSkillsDir: string;
  detect: () => boolean;
}

const home = homedir();

const AGENTS: AgentConfig[] = [
  {
    name: 'claude-code',
    displayName: 'Claude Code',
    globalSkillsDir: resolve(process.env.CLAUDE_CONFIG_DIR?.trim() || resolve(home, '.claude'), 'skills'),
    detect: () => existsSync(process.env.CLAUDE_CONFIG_DIR?.trim() || resolve(home, '.claude')),
  },
  {
    name: 'cursor',
    displayName: 'Cursor',
    globalSkillsDir: resolve(home, '.cursor', 'skills'),
    detect: () => existsSync(resolve(home, '.cursor')),
  },
  {
    name: 'windsurf',
    displayName: 'Windsurf',
    globalSkillsDir: resolve(home, '.codeium', 'windsurf', 'skills'),
    detect: () => existsSync(resolve(home, '.codeium', 'windsurf')),
  },
  {
    name: 'codex',
    displayName: 'Codex',
    globalSkillsDir: resolve(process.env.CODEX_HOME?.trim() || resolve(home, '.codex'), 'skills'),
    detect: () => existsSync(process.env.CODEX_HOME?.trim() || resolve(home, '.codex')),
  },
  {
    name: 'github-copilot',
    displayName: 'GitHub Copilot',
    globalSkillsDir: resolve(home, '.copilot', 'skills'),
    detect: () => existsSync(resolve(home, '.copilot')),
  },
  {
    name: 'gemini-cli',
    displayName: 'Gemini CLI',
    globalSkillsDir: resolve(home, '.gemini', 'skills'),
    detect: () => existsSync(resolve(home, '.gemini')),
  },
  {
    name: 'roo',
    displayName: 'Roo Code',
    globalSkillsDir: resolve(home, '.roo', 'skills'),
    detect: () => existsSync(resolve(home, '.roo')),
  },
];

// Canonical location per Agent Skills spec
const CANONICAL_DIR = resolve(home, '.agents', 'skills');

function getSkillsSourceDir(): string {
  // Walk up from src/commands or dist/ to find the repo root with skills/
  let dir = resolve(__dirname, '..');
  for (let i = 0; i < 5; i++) {
    const candidate = resolve(dir, 'skills', 'signwell-cli');
    if (existsSync(candidate)) {
      return resolve(dir, 'skills');
    }
    dir = resolve(dir, '..');
  }

  throw new Error('Could not locate the skills directory. Ensure the package is installed correctly.');
}

function copySkillsToDir(sourceDir: string, targetDir: string, force: boolean): string[] {
  const present: string[] = [];
  const entries = readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillSource = resolve(sourceDir, entry.name);
    const skillMd = resolve(skillSource, 'SKILL.md');
    if (!existsSync(skillMd)) continue;

    const skillTarget = resolve(targetDir, entry.name);

    if (existsSync(skillTarget)) {
      if (!force) {
        present.push(entry.name); // already installed, skip without --force
        continue;
      }
      // --force: remove and refresh
      rmSync(skillTarget, { recursive: true, force: true });
    }

    mkdirSync(skillTarget, { recursive: true });
    cpSync(skillSource, skillTarget, { recursive: true, force: true });
    present.push(entry.name);
  }

  return present;
}

function createSymlink(target: string, linkPath: string, force: boolean): boolean {
  try {
    // Check if link already points to the right place
    if (existsSync(linkPath)) {
      try {
        const stats = lstatSync(linkPath);
        if (stats.isSymbolicLink()) {
          const existing = readlinkSync(linkPath);
          const resolvedExisting = resolve(dirname(linkPath), existing);
          if (resolvedExisting === resolve(target)) {
            return true; // Already correct
          }
          if (!force) {
            return false;
          }
          rmSync(linkPath); // Wrong target, remove
        } else {
          if (!force) {
            return false;
          }
          rmSync(linkPath, { recursive: true }); // Not a symlink, remove
        }
      } catch {
        if (!force) {
          return false;
        }
        rmSync(linkPath, { recursive: true, force: true });
      }
    }

    mkdirSync(dirname(linkPath), { recursive: true });

    const relativePath = relative(dirname(linkPath), target);
    const symlinkType = platform() === 'win32' ? 'junction' : undefined;
    symlinkSync(relativePath, linkPath, symlinkType);
    return true;
  } catch {
    return false;
  }
}

function copyFallback(source: string, target: string, force: boolean): 'copy' | 'existing' | 'failed' {
  try {
    if (existsSync(target)) {
      if (!force) {
        return 'existing';
      }
      rmSync(target, { recursive: true, force: true });
    }
    mkdirSync(target, { recursive: true });
    cpSync(source, target, { recursive: true, force: true });
    return 'copy';
  } catch {
    return 'failed';
  }
}

export function registerSkillsCommand(yargs: Argv): Argv {
  return yargs.command(
    'skills',
    'Manage SignWell CLI skills for AI agents',
    (y) =>
      y
        .command(
          'install',
          'Install SignWell CLI skills for detected AI agents',
          (yy) =>
            yy
              .option('agent', {
                type: 'string',
                describe: 'Install for a specific agent only (e.g., claude-code, cursor)',
              })
              .option('force', {
                type: 'boolean',
                describe: 'Overwrite existing skill installations',
                default: false,
              }),
          (argv) => {
            const isJson = argv.json as boolean;

            try {
              const sourceDir = getSkillsSourceDir();
              const force = argv.force as boolean;

              // 1. Copy to canonical ~/.agents/skills/
              mkdirSync(CANONICAL_DIR, { recursive: true });
              const skillNames = copySkillsToDir(sourceDir, CANONICAL_DIR, force);

              if (skillNames.length === 0) {
                throw new Error('No skills found in package.');
              }

              // 2. Detect installed agents and create symlinks
              const agentFilter = argv.agent as string | undefined;
              const targetAgents = agentFilter
                ? AGENTS.filter((a) => a.name === agentFilter)
                : AGENTS.filter((a) => a.detect());

              if (agentFilter && targetAgents.length === 0) {
                throw new Error(`Unknown agent: ${agentFilter}. Available: ${AGENTS.map((a) => a.name).join(', ')}`);
              }

              const results: Array<{ agent: string; skill: string; method: string }> = [];

              for (const agent of targetAgents) {
                for (const skillName of skillNames) {
                  const canonicalSkillDir = resolve(CANONICAL_DIR, skillName);
                  const agentSkillDir = resolve(agent.globalSkillsDir, skillName);

                  // Skip if canonical and agent dir are the same location
                  if (resolve(canonicalSkillDir) === resolve(agentSkillDir)) {
                    results.push({ agent: agent.displayName, skill: skillName, method: 'canonical' });
                    continue;
                  }

                  // Try symlink first, fall back to copy
                  const linked = createSymlink(canonicalSkillDir, agentSkillDir, force);
                  if (linked) {
                    results.push({ agent: agent.displayName, skill: skillName, method: 'symlink' });
                  } else {
                    const copied = copyFallback(canonicalSkillDir, agentSkillDir, force);
                    results.push({
                      agent: agent.displayName,
                      skill: skillName,
                      method: copied,
                    });
                  }
                }
              }

              if (isJson) {
                printJson({
                  skills: skillNames,
                  canonical_path: CANONICAL_DIR,
                  agents: results,
                });
              } else {
                printSuccess(`Installed ${skillNames.length} skill(s) to ${CANONICAL_DIR}`);
                for (const r of results) {
                  const icon = r.method === 'failed' ? 'x' : '+';
                  printInfo(`  ${icon} ${r.agent}: ${r.skill} (${r.method})`);
                }
                if (targetAgents.length === 0) {
                  printInfo('No AI agents detected. Skills installed to canonical location only.');
                  printInfo(`You can also install with: npx skills add Bidsketch/signwell-cli`);
                }
              }
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              if (isJson) {
                printErrorJson({ code: 'INSTALL_ERROR', message, hint: 'Ensure signwell-cli is installed correctly', http_status: 0 });
              } else {
                printError(`Failed to install skills: ${message}`);
              }
              process.exit(1);
            }
          },
        )
        .demandCommand(1, 'Please specify a subcommand. Run `sw skills --help` for options.'),
  );
}
