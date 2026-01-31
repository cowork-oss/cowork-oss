/**
 * Tests for Tailscale Settings Manager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

let mockSettings: Record<string, unknown> = {};
let writeCount = 0;

// Mock fs module
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockImplementation(() => Object.keys(mockSettings).length > 0),
    readFileSync: vi.fn().mockImplementation(() => JSON.stringify(mockSettings)),
    writeFileSync: vi.fn().mockImplementation((path: string, data: string) => {
      mockSettings = JSON.parse(data);
      writeCount++;
    }),
  },
  existsSync: vi.fn().mockImplementation(() => Object.keys(mockSettings).length > 0),
  readFileSync: vi.fn().mockImplementation(() => JSON.stringify(mockSettings)),
  writeFileSync: vi.fn().mockImplementation((path: string, data: string) => {
    mockSettings = JSON.parse(data);
    writeCount++;
  }),
}));

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/user/data'),
  },
}));

// Import after mocking
import {
  TailscaleSettingsManager,
  DEFAULT_TAILSCALE_SETTINGS,
} from '../settings';

describe('DEFAULT_TAILSCALE_SETTINGS', () => {
  it('should have expected default values', () => {
    expect(DEFAULT_TAILSCALE_SETTINGS.mode).toBe('off');
    expect(DEFAULT_TAILSCALE_SETTINGS.resetOnExit).toBe(true);
  });
});

describe('TailscaleSettingsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings = {};
    writeCount = 0;
    TailscaleSettingsManager.clearCache();
  });

  describe('loadSettings', () => {
    it('should return defaults when no settings file exists', () => {
      const settings = TailscaleSettingsManager.loadSettings();

      expect(settings.mode).toBe('off');
      expect(settings.resetOnExit).toBe(true);
    });

    it('should load existing settings', () => {
      mockSettings = {
        mode: 'funnel',
        resetOnExit: false,
        lastHostname: 'my-machine.tail1234.ts.net',
      };

      const settings = TailscaleSettingsManager.loadSettings();

      expect(settings.mode).toBe('funnel');
      expect(settings.resetOnExit).toBe(false);
      expect(settings.lastHostname).toBe('my-machine.tail1234.ts.net');
    });

    it('should merge with defaults for missing fields', () => {
      mockSettings = {
        mode: 'serve',
      };

      const settings = TailscaleSettingsManager.loadSettings();

      expect(settings.mode).toBe('serve');
      expect(settings.resetOnExit).toBe(true); // from defaults
    });

    it('should cache loaded settings', () => {
      mockSettings = { mode: 'serve' };

      const settings1 = TailscaleSettingsManager.loadSettings();
      mockSettings = { mode: 'funnel' }; // Change mock
      const settings2 = TailscaleSettingsManager.loadSettings();

      // Should return cached value
      expect(settings2.mode).toBe('serve');
    });
  });

  describe('saveSettings', () => {
    it('should save settings to disk', () => {
      const settings = TailscaleSettingsManager.loadSettings();
      settings.mode = 'funnel';
      settings.lastHostname = 'test.ts.net';

      TailscaleSettingsManager.saveSettings(settings);

      expect(writeCount).toBe(1);
      expect(mockSettings.mode).toBe('funnel');
      expect(mockSettings.lastHostname).toBe('test.ts.net');
    });

    it('should update cache after save', () => {
      const settings = TailscaleSettingsManager.loadSettings();
      settings.mode = 'serve';
      TailscaleSettingsManager.saveSettings(settings);

      const cached = TailscaleSettingsManager.loadSettings();
      expect(cached.mode).toBe('serve');
    });
  });

  describe('updateSettings', () => {
    it('should update and save settings', () => {
      TailscaleSettingsManager.updateSettings({
        mode: 'funnel',
        lastHostname: 'test.ts.net',
      });

      expect(mockSettings.mode).toBe('funnel');
      expect(mockSettings.lastHostname).toBe('test.ts.net');
    });

    it('should merge with existing settings', () => {
      mockSettings = { mode: 'serve', resetOnExit: false };
      TailscaleSettingsManager.clearCache();

      TailscaleSettingsManager.updateSettings({ mode: 'funnel' });

      expect(mockSettings.mode).toBe('funnel');
      expect(mockSettings.resetOnExit).toBe(false); // preserved
    });
  });

  describe('setMode', () => {
    it('should update mode setting', () => {
      const settings = TailscaleSettingsManager.setMode('funnel');

      expect(settings.mode).toBe('funnel');
      expect(mockSettings.mode).toBe('funnel');
    });

    it('should preserve other settings', () => {
      mockSettings = {
        mode: 'off',
        resetOnExit: false,
        lastHostname: 'test.ts.net',
      };
      TailscaleSettingsManager.clearCache();

      TailscaleSettingsManager.setMode('serve');

      expect(mockSettings.resetOnExit).toBe(false);
      expect(mockSettings.lastHostname).toBe('test.ts.net');
    });
  });

  describe('clearCache', () => {
    it('should clear the cached settings', () => {
      mockSettings = { mode: 'serve' };
      TailscaleSettingsManager.loadSettings();

      TailscaleSettingsManager.clearCache();
      mockSettings = { mode: 'funnel' };

      const settings = TailscaleSettingsManager.loadSettings();
      expect(settings.mode).toBe('funnel');
    });
  });

  describe('getDefaults', () => {
    it('should return default settings', () => {
      const defaults = TailscaleSettingsManager.getDefaults();

      expect(defaults.mode).toBe('off');
      expect(defaults.resetOnExit).toBe(true);
    });

    it('should return a copy, not the original', () => {
      const defaults1 = TailscaleSettingsManager.getDefaults();
      defaults1.mode = 'funnel';
      const defaults2 = TailscaleSettingsManager.getDefaults();

      expect(defaults2.mode).toBe('off');
    });
  });
});
