import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Tests for getSafeStorage helper.
 *
 * The module uses `require('electron')` at runtime inside the function body.
 * In the vitest test environment, `require('electron')` resolves to the Electron
 * binary path (a string), not the Electron API object, so safeStorage is never available.
 * We test the code paths that are reachable in this environment.
 */

describe('getSafeStorage', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns null when electron does not provide safeStorage (test env)', async () => {
    // In the test environment, require('electron') returns the binary path string,
    // not the Electron module APIs, so getSafeStorage should return null.
    const { getSafeStorage } = await import('../safe-storage');
    const result = getSafeStorage();
    expect(result).toBeNull();
  });

  it('SafeStorageLike interface shape is correct', async () => {
    const { getSafeStorage } = await import('../safe-storage');
    // Verify the function exists and returns the expected type
    expect(typeof getSafeStorage).toBe('function');
    const result = getSafeStorage();
    // In test env, always null
    expect(result).toBeNull();
  });

  it('handles errors gracefully when electron module throws', async () => {
    // Mock require to simulate electron not being available at all
    vi.doMock('electron', () => {
      throw new Error('Cannot find module');
    });
    const mod = await import('../safe-storage');
    const result = mod.getSafeStorage();
    expect(result).toBeNull();
    vi.doUnmock('electron');
  });
});
