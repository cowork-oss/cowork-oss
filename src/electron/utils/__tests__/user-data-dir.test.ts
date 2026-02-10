import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Don't mock electron globally - the module uses try/catch for require('electron')
// so it will naturally fall through to the $HOME/.cowork fallback in test env.

describe('getUserDataDir', () => {
  let originalArgv: string[];
  let envSnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    originalArgv = [...process.argv];
    envSnapshot = { ...process.env };
    // Reset module registry so each test gets a fresh import
    vi.resetModules();
  });

  afterEach(() => {
    process.argv = originalArgv;
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, envSnapshot);
  });

  it('returns COWORK_USER_DATA_DIR when env var is set', async () => {
    process.env.COWORK_USER_DATA_DIR = '/custom/data';
    process.argv = ['node', 'app'];
    const { getUserDataDir } = await import('../user-data-dir');
    expect(getUserDataDir()).toBe('/custom/data');
  });

  it('expands tilde in COWORK_USER_DATA_DIR', async () => {
    process.env.COWORK_USER_DATA_DIR = '~/cowork-data';
    process.argv = ['node', 'app'];
    const { getUserDataDir } = await import('../user-data-dir');
    expect(getUserDataDir()).toBe(path.join(os.homedir(), 'cowork-data'));
  });

  it('expands bare tilde in COWORK_USER_DATA_DIR', async () => {
    process.env.COWORK_USER_DATA_DIR = '~';
    process.argv = ['node', 'app'];
    const { getUserDataDir } = await import('../user-data-dir');
    expect(getUserDataDir()).toBe(os.homedir());
  });

  it('ignores empty COWORK_USER_DATA_DIR', async () => {
    process.env.COWORK_USER_DATA_DIR = '   ';
    process.argv = ['node', 'app'];
    const { getUserDataDir } = await import('../user-data-dir');
    const result = getUserDataDir();
    expect(result).not.toBe('   ');
  });

  it('returns --user-data-dir value from argv (space form)', async () => {
    delete process.env.COWORK_USER_DATA_DIR;
    process.argv = ['node', 'app', '--user-data-dir', '/from/argv'];
    const { getUserDataDir } = await import('../user-data-dir');
    expect(getUserDataDir()).toBe('/from/argv');
  });

  it('returns --user-data-dir value from argv (equals form)', async () => {
    delete process.env.COWORK_USER_DATA_DIR;
    process.argv = ['node', 'app', '--user-data-dir=/from/argv'];
    const { getUserDataDir } = await import('../user-data-dir');
    expect(getUserDataDir()).toBe('/from/argv');
  });

  it('expands tilde in --user-data-dir', async () => {
    delete process.env.COWORK_USER_DATA_DIR;
    process.argv = ['node', 'app', '--user-data-dir', '~/my-data'];
    const { getUserDataDir } = await import('../user-data-dir');
    expect(getUserDataDir()).toBe(path.join(os.homedir(), 'my-data'));
  });

  it('falls back to $HOME/.cowork when no overrides and no Electron', async () => {
    delete process.env.COWORK_USER_DATA_DIR;
    process.argv = ['node', 'app'];
    const { getUserDataDir } = await import('../user-data-dir');
    const result = getUserDataDir();
    // In test env (no Electron runtime), it should fall through to $HOME/.cowork
    const expected = path.join(os.homedir(), '.cowork');
    expect(result).toBe(expected);
  });

  it('env var takes priority over argv', async () => {
    process.env.COWORK_USER_DATA_DIR = '/from/env';
    process.argv = ['node', 'app', '--user-data-dir', '/from/argv'];
    const { getUserDataDir } = await import('../user-data-dir');
    expect(getUserDataDir()).toBe('/from/env');
  });
});
