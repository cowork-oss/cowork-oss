import React, { useState, useEffect } from 'react';

interface ToolCategoryConfig {
  enabled: boolean;
  priority: 'high' | 'normal' | 'low';
  description?: string;
}

interface BuiltinToolsSettingsData {
  categories: {
    browser: ToolCategoryConfig;
    search: ToolCategoryConfig;
    system: ToolCategoryConfig;
    file: ToolCategoryConfig;
    skill: ToolCategoryConfig;
    shell: ToolCategoryConfig;
    image: ToolCategoryConfig;
  };
  toolOverrides: Record<string, { enabled: boolean; priority?: 'high' | 'normal' | 'low' }>;
  version: string;
}

type CategoryKey = keyof BuiltinToolsSettingsData['categories'];

const CATEGORY_INFO: Record<CategoryKey, { name: string; icon: React.ReactNode; description: string }> = {
  file: {
    name: 'File Operations',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <polyline points="13 2 13 9 20 9" />
      </svg>
    ),
    description: 'Read, write, copy, delete files and directories',
  },
  browser: {
    name: 'Browser Automation',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    description: 'Navigate websites, click, fill forms, take screenshots',
  },
  search: {
    name: 'Web Search',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
    ),
    description: 'Search the web using configured providers (Brave, Tavily, etc.)',
  },
  system: {
    name: 'System Tools',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8" />
        <path d="M12 17v4" />
      </svg>
    ),
    description: 'Clipboard, screenshots, open apps and URLs',
  },
  skill: {
    name: 'Document Skills',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
    description: 'Create spreadsheets, documents, presentations',
  },
  shell: {
    name: 'Shell Commands',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    ),
    description: 'Execute terminal commands (requires approval)',
  },
  image: {
    name: 'Image Generation',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    ),
    description: 'Generate images using AI (requires Gemini API)',
  },
};

const PRIORITY_OPTIONS: Array<{ value: 'high' | 'normal' | 'low'; label: string; description: string }> = [
  { value: 'high', label: 'High', description: 'Prefer these tools over others' },
  { value: 'normal', label: 'Normal', description: 'Default priority' },
  { value: 'low', label: 'Low', description: 'Use only when specifically needed' },
];

export function BuiltinToolsSettings() {
  const [settings, setSettings] = useState<BuiltinToolsSettingsData | null>(null);
  const [categories, setCategories] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [loadedSettings, loadedCategories] = await Promise.all([
        window.electronAPI.getBuiltinToolsSettings(),
        window.electronAPI.getBuiltinToolsCategories(),
      ]);
      setSettings(loadedSettings);
      setCategories(loadedCategories);
    } catch (error) {
      console.error('Failed to load built-in tools settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryToggle = async (category: CategoryKey, enabled: boolean) => {
    if (!settings) return;

    const newSettings = {
      ...settings,
      categories: {
        ...settings.categories,
        [category]: {
          ...settings.categories[category],
          enabled,
        },
      },
    };

    setSettings(newSettings);

    try {
      setSaving(true);
      await window.electronAPI.saveBuiltinToolsSettings(newSettings);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCategoryPriority = async (category: CategoryKey, priority: 'high' | 'normal' | 'low') => {
    if (!settings) return;

    const newSettings = {
      ...settings,
      categories: {
        ...settings.categories,
        [category]: {
          ...settings.categories[category],
          priority,
        },
      },
    };

    setSettings(newSettings);

    try {
      setSaving(true);
      await window.electronAPI.saveBuiltinToolsSettings(newSettings);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="settings-loading">Loading settings...</div>;
  }

  if (!settings) {
    return <div className="settings-error">Failed to load settings</div>;
  }

  return (
    <div className="builtin-tools-settings">
      <div className="settings-section">
        <h3>Built-in Tools</h3>
        <p className="settings-description">
          Control which built-in tools are available to the agent. Disabling a category will prevent the agent from using those tools.
          Setting a lower priority makes the agent less likely to choose those tools when alternatives exist.
        </p>
      </div>

      <div className="builtin-tools-categories">
        {(Object.keys(CATEGORY_INFO) as CategoryKey[]).map((category) => {
          const info = CATEGORY_INFO[category];
          const config = settings.categories[category];
          const tools = categories[category] || [];

          return (
            <div
              key={category}
              className={`builtin-tool-category ${!config.enabled ? 'disabled' : ''}`}
            >
              <div className="builtin-tool-category-header">
                <div className="builtin-tool-category-info">
                  <div className="builtin-tool-category-icon">{info.icon}</div>
                  <div className="builtin-tool-category-text">
                    <div className="builtin-tool-category-name">{info.name}</div>
                    <div className="builtin-tool-category-desc">{info.description}</div>
                  </div>
                </div>

                <div className="builtin-tool-category-controls">
                  <select
                    className="builtin-tool-priority-select"
                    value={config.priority}
                    onChange={(e) => handleCategoryPriority(category, e.target.value as 'high' | 'normal' | 'low')}
                    disabled={!config.enabled}
                    title="Tool priority"
                  >
                    {PRIORITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  <label className="builtin-tool-toggle">
                    <input
                      type="checkbox"
                      checked={config.enabled}
                      onChange={(e) => handleCategoryToggle(category, e.target.checked)}
                    />
                    <span className="builtin-tool-toggle-slider"></span>
                  </label>

                  <button
                    className="builtin-tool-expand-btn"
                    onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
                    title="Show tools in this category"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{
                        transform: expandedCategory === category ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.2s',
                      }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                </div>
              </div>

              {expandedCategory === category && tools.length > 0 && (
                <div className="builtin-tool-list">
                  {tools.map((tool) => (
                    <div key={tool} className="builtin-tool-item">
                      <code>{tool}</code>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="settings-section">
        <h3>About Tool Priority</h3>
        <p className="settings-description">
          Tool priority affects which tools the agent chooses when multiple options could work:
        </p>
        <ul className="settings-list">
          <li><strong>High:</strong> The agent will prefer these tools over alternatives</li>
          <li><strong>Normal:</strong> Default behavior - tools are considered equally</li>
          <li><strong>Low:</strong> The agent will only use these if specifically needed or no alternatives exist</li>
        </ul>
        <p className="settings-hint">
          For example, if you have MCP servers that provide similar functionality to built-in tools,
          you can set the built-in tools to "Low" priority so the agent prefers the MCP versions.
        </p>
      </div>

      {saving && (
        <div className="builtin-tools-saving">
          Saving...
        </div>
      )}
    </div>
  );
}
