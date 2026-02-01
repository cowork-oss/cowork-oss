import { useState, useEffect } from 'react';
import { TraySettings as TraySettingsType } from '../../shared/types';

interface TraySettingsProps {
  onStatusChange?: (enabled: boolean) => void;
}

export function TraySettings({ onStatusChange }: TraySettingsProps) {
  const [settings, setSettings] = useState<TraySettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Check if we're on macOS
  const [isMacOS, setIsMacOS] = useState(true);

  useEffect(() => {
    // Check platform
    const platform = navigator.platform.toLowerCase();
    setIsMacOS(platform.includes('mac'));

    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const traySettings = await window.electronAPI.getTraySettings();
      setSettings(traySettings);
      onStatusChange?.(traySettings.enabled);
    } catch (error) {
      console.error('Failed to load tray settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (newSettings: Partial<TraySettingsType>) => {
    try {
      setSaving(true);
      await window.electronAPI.saveTraySettings(newSettings);
      setSettings((prev) => prev ? { ...prev, ...newSettings } : null);
      if (newSettings.enabled !== undefined) {
        onStatusChange?.(newSettings.enabled);
      }
    } catch (error) {
      console.error('Failed to save tray settings:', error);
    } finally {
      setSaving(false);
    }
  };

  if (!isMacOS) {
    return (
      <div className="tray-settings">
        <div className="settings-section">
          <h3>Menu Bar</h3>
          <div className="settings-warning">
            Menu bar integration is only available on macOS.
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="settings-loading">Loading menu bar settings...</div>;
  }

  return (
    <div className="tray-settings">
      <div className="settings-section">
        <h3>Menu Bar</h3>
        <p className="settings-description">
          Configure the menu bar icon and behavior. The menu bar provides quick access to workspaces and tasks.
        </p>

        <div className="settings-toggle-group">
          <div className="settings-toggle-item">
            <div className="toggle-info">
              <span className="toggle-label">Enable Menu Bar Icon</span>
              <span className="toggle-description">
                Show CoWork OS icon in the macOS menu bar
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings?.enabled ?? true}
                onChange={(e) => handleSave({ enabled: e.target.checked })}
                disabled={saving}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="settings-toggle-item">
            <div className="toggle-info">
              <span className="toggle-label">Show Dock Icon</span>
              <span className="toggle-description">
                Show CoWork OS in the macOS Dock when running
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings?.showDockIcon ?? true}
                onChange={(e) => handleSave({ showDockIcon: e.target.checked })}
                disabled={saving}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="settings-toggle-item">
            <div className="toggle-info">
              <span className="toggle-label">Start Minimized</span>
              <span className="toggle-description">
                Start with the main window hidden (menu bar only)
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings?.startMinimized ?? false}
                onChange={(e) => handleSave({ startMinimized: e.target.checked })}
                disabled={saving}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="settings-toggle-item">
            <div className="toggle-info">
              <span className="toggle-label">Close to Menu Bar</span>
              <span className="toggle-description">
                Closing the window minimizes to menu bar instead of quitting
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings?.closeToTray ?? true}
                onChange={(e) => handleSave({ closeToTray: e.target.checked })}
                disabled={saving}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="settings-toggle-item">
            <div className="toggle-info">
              <span className="toggle-label">Show Notifications</span>
              <span className="toggle-description">
                Show system notifications for task completions and updates
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings?.showNotifications ?? true}
                onChange={(e) => handleSave({ showNotifications: e.target.checked })}
                disabled={saving}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h4>Menu Bar Features</h4>
        <div className="settings-callout info">
          <strong>Quick Access:</strong>
          <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
            <li>Click the menu bar icon to show/hide the main window</li>
            <li>Right-click (or click) to see the quick menu with:
              <ul style={{ paddingLeft: '20px', marginTop: '4px' }}>
                <li>Channel connection status</li>
                <li>Workspace selection</li>
                <li>New task shortcut</li>
                <li>Settings access</li>
              </ul>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
