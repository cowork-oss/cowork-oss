import { useState, useEffect } from 'react';
import { SearchProviderType, SearchConfigStatus } from '../../shared/types';

interface SearchSettingsProps {
  onStatusChange?: (configured: boolean) => void;
}

export function SearchSettings({ onStatusChange }: SearchSettingsProps) {
  const [configStatus, setConfigStatus] = useState<SearchConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingProvider, setTestingProvider] = useState<SearchProviderType | null>(null);
  const [testResult, setTestResult] = useState<{ provider: SearchProviderType; success: boolean; error?: string } | null>(null);

  // Form state
  const [primaryProvider, setPrimaryProvider] = useState<SearchProviderType | null>(null);
  const [fallbackProvider, setFallbackProvider] = useState<SearchProviderType | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const status = await window.electronAPI.getSearchConfigStatus();
      setConfigStatus(status);
      setPrimaryProvider(status.primaryProvider);
      setFallbackProvider(status.fallbackProvider);
      onStatusChange?.(status.isConfigured);
    } catch (error) {
      console.error('Failed to load search config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setTestResult(null);
      await window.electronAPI.saveSearchSettings({
        primaryProvider,
        fallbackProvider,
      });
      await loadConfig();
    } catch (error: any) {
      console.error('Failed to save search settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleTestProvider = async (providerType: SearchProviderType) => {
    try {
      setTestingProvider(providerType);
      setTestResult(null);
      const result = await window.electronAPI.testSearchProvider(providerType);
      setTestResult({ provider: providerType, ...result });
    } catch (error: any) {
      setTestResult({ provider: providerType, success: false, error: error.message });
    } finally {
      setTestingProvider(null);
    }
  };

  const configuredProviders = configStatus?.providers.filter(p => p.configured) || [];
  const hasMultipleProviders = configuredProviders.length > 1;

  if (loading) {
    return <div className="settings-loading">Loading search settings...</div>;
  }

  // No providers configured
  if (!configStatus?.isConfigured) {
    return (
      <div className="search-settings">
        <div className="settings-section">
          <h3>Web Search</h3>
          <p className="settings-description">
            No search providers are configured. Add API keys to your .env file to enable web search.
          </p>

          <div className="provider-setup-list">
            {configStatus?.providers.map(provider => (
              <div key={provider.type} className="provider-setup-item">
                <div className="provider-setup-info">
                  <span className="provider-name">{provider.name}</span>
                  <span className="provider-description">{provider.description}</span>
                  <span className="provider-types">
                    Supports: {provider.supportedTypes.join(', ')}
                  </span>
                </div>
                <div className={`provider-status ${provider.configured ? 'configured' : 'not-configured'}`}>
                  {provider.configured ? '✓ Configured' : '○ Not configured'}
                </div>
              </div>
            ))}
          </div>

          <div className="settings-hint-box">
            <h4>How to configure</h4>
            <p>Add one or more of these to your <code>.env</code> file:</p>
            <pre>{`# Tavily (recommended)
TAVILY_API_KEY=tvly-...

# Brave Search
BRAVE_API_KEY=BSA...

# SerpAPI
SERPAPI_KEY=...

# Google Custom Search
GOOGLE_API_KEY=AIza...
GOOGLE_SEARCH_ENGINE_ID=...`}</pre>
          </div>
        </div>
      </div>
    );
  }

  // Providers are configured
  return (
    <div className="search-settings">
      <div className="settings-section">
        <h3>Primary Provider</h3>
        <p className="settings-description">
          Select which search provider to use by default.
        </p>

        <div className="provider-options">
          {configuredProviders.map(provider => (
            <label
              key={provider.type}
              className={`provider-option ${primaryProvider === provider.type ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="primaryProvider"
                checked={primaryProvider === provider.type}
                onChange={() => {
                  setPrimaryProvider(provider.type);
                  // Clear fallback if same as new primary
                  if (fallbackProvider === provider.type) {
                    setFallbackProvider(null);
                  }
                }}
              />
              <div className="provider-option-content">
                <div className="provider-option-header">
                  <span className="provider-name">{provider.name}</span>
                  <button
                    className="button-small button-secondary"
                    onClick={(e) => {
                      e.preventDefault();
                      handleTestProvider(provider.type);
                    }}
                    disabled={testingProvider === provider.type}
                  >
                    {testingProvider === provider.type ? 'Testing...' : 'Test'}
                  </button>
                </div>
                <span className="provider-description">{provider.description}</span>
                <span className="provider-types">
                  Supports: {provider.supportedTypes.join(', ')}
                </span>
                {testResult?.provider === provider.type && (
                  <div className={`test-result-inline ${testResult.success ? 'success' : 'error'}`}>
                    {testResult.success ? '✓ Connection successful' : `✗ ${testResult.error}`}
                  </div>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>

      {hasMultipleProviders && (
        <div className="settings-section">
          <h3>Fallback Provider</h3>
          <p className="settings-description">
            If the primary provider fails, the fallback will be used automatically.
          </p>

          <div className="provider-options">
            <label
              className={`provider-option ${fallbackProvider === null ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="fallbackProvider"
                checked={fallbackProvider === null}
                onChange={() => setFallbackProvider(null)}
              />
              <div className="provider-option-content">
                <span className="provider-name">None</span>
                <span className="provider-description">No fallback - fail if primary is unavailable</span>
              </div>
            </label>

            {configuredProviders
              .filter(p => p.type !== primaryProvider)
              .map(provider => (
                <label
                  key={provider.type}
                  className={`provider-option ${fallbackProvider === provider.type ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="fallbackProvider"
                    checked={fallbackProvider === provider.type}
                    onChange={() => setFallbackProvider(provider.type)}
                  />
                  <div className="provider-option-content">
                    <div className="provider-option-header">
                      <span className="provider-name">{provider.name}</span>
                    </div>
                    <span className="provider-description">{provider.description}</span>
                    <span className="provider-types">
                      Supports: {provider.supportedTypes.join(', ')}
                    </span>
                  </div>
                </label>
              ))}
          </div>
        </div>
      )}

      <div className="settings-section">
        <h4>All Configured Providers</h4>
        <div className="providers-summary">
          {configStatus?.providers.map(provider => (
            <div key={provider.type} className="provider-summary-item">
              <span className="provider-name">{provider.name}</span>
              <span className={`provider-status ${provider.configured ? 'configured' : 'not-configured'}`}>
                {provider.configured ? '✓ Ready' : '○ Not configured'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-actions">
        <button
          className="button-primary"
          onClick={handleSave}
          disabled={saving || !primaryProvider}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
