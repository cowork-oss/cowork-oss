/**
 * Tailscale Settings Manager
 *
 * Manages Tailscale configuration persistence.
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const SETTINGS_FILE = 'tailscale-settings.json';

/**
 * Tailscale mode options
 * - off: Tailscale integration disabled
 * - serve: Expose to Tailnet (private network)
 * - funnel: Expose to public internet
 */
export type TailscaleMode = 'off' | 'serve' | 'funnel';

/**
 * Tailscale settings interface
 */
export interface TailscaleSettings {
  /** Current mode */
  mode: TailscaleMode;
  /** Whether to reset Tailscale config on app exit */
  resetOnExit: boolean;
  /** Custom path prefix for the exposed endpoint */
  pathPrefix?: string;
  /** Last known hostname */
  lastHostname?: string;
  /** Timestamp of last status check */
  lastStatusCheck?: number;
}

/**
 * Default Tailscale settings
 */
export const DEFAULT_TAILSCALE_SETTINGS: TailscaleSettings = {
  mode: 'off',
  resetOnExit: true,
};

/**
 * Tailscale Settings Manager
 */
export class TailscaleSettingsManager {
  private static settingsPath: string;
  private static cachedSettings: TailscaleSettings | null = null;
  private static initialized = false;

  /**
   * Initialize the settings manager (must be called after app is ready)
   */
  static initialize(): void {
    if (this.initialized) return;

    const userDataPath = app.getPath('userData');
    this.settingsPath = path.join(userDataPath, SETTINGS_FILE);
    this.initialized = true;

    console.log('[Tailscale Settings] Initialized with path:', this.settingsPath);
  }

  /**
   * Ensure the manager is initialized
   */
  private static ensureInitialized(): void {
    if (!this.initialized) {
      this.initialize();
    }
  }

  /**
   * Load settings from disk
   */
  static loadSettings(): TailscaleSettings {
    this.ensureInitialized();

    if (this.cachedSettings) {
      return this.cachedSettings;
    }

    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf-8');
        const parsed = JSON.parse(data);

        // Merge with defaults to handle missing fields
        const merged: TailscaleSettings = {
          ...DEFAULT_TAILSCALE_SETTINGS,
          ...parsed,
        };

        this.cachedSettings = merged;
        console.log('[Tailscale Settings] Loaded settings');
      } else {
        console.log('[Tailscale Settings] No settings file found, using defaults');
        this.cachedSettings = { ...DEFAULT_TAILSCALE_SETTINGS };
      }
    } catch (error) {
      console.error('[Tailscale Settings] Failed to load settings:', error);
      this.cachedSettings = { ...DEFAULT_TAILSCALE_SETTINGS };
    }

    return this.cachedSettings;
  }

  /**
   * Save settings to disk
   */
  static saveSettings(settings: TailscaleSettings): void {
    this.ensureInitialized();

    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2));
      this.cachedSettings = settings;
      console.log('[Tailscale Settings] Saved settings');
    } catch (error) {
      console.error('[Tailscale Settings] Failed to save settings:', error);
      throw error;
    }
  }

  /**
   * Update settings partially
   */
  static updateSettings(updates: Partial<TailscaleSettings>): TailscaleSettings {
    const settings = this.loadSettings();
    const updated = { ...settings, ...updates };
    this.saveSettings(updated);
    return updated;
  }

  /**
   * Set the Tailscale mode
   */
  static setMode(mode: TailscaleMode): TailscaleSettings {
    return this.updateSettings({ mode });
  }

  /**
   * Clear the settings cache
   */
  static clearCache(): void {
    this.cachedSettings = null;
  }

  /**
   * Get default settings
   */
  static getDefaults(): TailscaleSettings {
    return { ...DEFAULT_TAILSCALE_SETTINGS };
  }
}
