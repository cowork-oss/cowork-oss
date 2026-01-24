import { useState, useEffect } from 'react';
import { LLMSettingsData } from '../../shared/types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ModelOption {
  key: string;
  displayName: string;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<LLMSettingsData>({
    providerType: 'anthropic',
    modelKey: 'sonnet-3-5',
  });
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  // Form state for credentials (not persisted directly)
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [awsRegion, setAwsRegion] = useState('us-east-1');
  const [awsAccessKeyId, setAwsAccessKeyId] = useState('');
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState('');
  const [awsProfile, setAwsProfile] = useState('');
  const [useDefaultCredentials, setUseDefaultCredentials] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      loadModels();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const loadedSettings = await window.electronAPI.getLLMSettings();
      setSettings(loadedSettings);

      // Set form state from loaded settings
      if (loadedSettings.bedrock?.region) {
        setAwsRegion(loadedSettings.bedrock.region);
      }
      if (loadedSettings.bedrock?.profile) {
        setAwsProfile(loadedSettings.bedrock.profile);
      }
      setUseDefaultCredentials(loadedSettings.bedrock?.useDefaultCredentials ?? true);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadModels = async () => {
    try {
      const loadedModels = await window.electronAPI.getLLMModels();
      setModels(loadedModels);
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setTestResult(null);

      const settingsToSave: LLMSettingsData = {
        ...settings,
        anthropic: settings.providerType === 'anthropic' ? {
          apiKey: anthropicApiKey || undefined,
        } : undefined,
        bedrock: settings.providerType === 'bedrock' ? {
          region: awsRegion,
          useDefaultCredentials,
          ...(useDefaultCredentials ? {
            profile: awsProfile || undefined,
          } : {
            accessKeyId: awsAccessKeyId || undefined,
            secretAccessKey: awsSecretAccessKey || undefined,
          }),
        } : undefined,
      };

      await window.electronAPI.saveLLMSettings(settingsToSave);
      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setTestResult(null);

      const testConfig = {
        providerType: settings.providerType,
        modelKey: settings.modelKey,
        anthropic: settings.providerType === 'anthropic' ? {
          apiKey: anthropicApiKey || undefined,
        } : undefined,
        bedrock: settings.providerType === 'bedrock' ? {
          region: awsRegion,
          ...(useDefaultCredentials ? {
            profile: awsProfile || undefined,
          } : {
            accessKeyId: awsAccessKeyId || undefined,
            secretAccessKey: awsSecretAccessKey || undefined,
          }),
        } : undefined,
      };

      const result = await window.electronAPI.testLLMProvider(testConfig);
      setTestResult(result);
    } catch (error: any) {
      setTestResult({ success: false, error: error.message });
    } finally {
      setTesting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="settings-loading">Loading settings...</div>
          ) : (
            <>
              <div className="settings-section">
                <h3>LLM Provider</h3>
                <p className="settings-description">
                  Choose which service to use for AI model calls
                </p>

                <div className="provider-options">
                  <label className={`provider-option ${settings.providerType === 'anthropic' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="provider"
                      value="anthropic"
                      checked={settings.providerType === 'anthropic'}
                      onChange={() => setSettings({ ...settings, providerType: 'anthropic' })}
                    />
                    <div className="provider-option-content">
                      <div className="provider-option-title">Anthropic API</div>
                      <div className="provider-option-description">
                        Direct API access using your Anthropic API key
                      </div>
                    </div>
                  </label>

                  <label className={`provider-option ${settings.providerType === 'bedrock' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="provider"
                      value="bedrock"
                      checked={settings.providerType === 'bedrock'}
                      onChange={() => setSettings({ ...settings, providerType: 'bedrock' })}
                    />
                    <div className="provider-option-content">
                      <div className="provider-option-title">AWS Bedrock</div>
                      <div className="provider-option-description">
                        Access AI models through AWS Bedrock using your AWS credentials
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="settings-section">
                <h3>Model</h3>
                <select
                  className="settings-select"
                  value={settings.modelKey}
                  onChange={(e) => setSettings({ ...settings, modelKey: e.target.value })}
                >
                  {models.map(model => (
                    <option key={model.key} value={model.key}>
                      {model.displayName}
                    </option>
                  ))}
                </select>
              </div>

              {settings.providerType === 'anthropic' && (
                <div className="settings-section">
                  <h3>Anthropic API Key</h3>
                  <p className="settings-description">
                    Enter your API key from console.anthropic.com. Leave empty to use ANTHROPIC_API_KEY environment variable.
                  </p>
                  <input
                    type="password"
                    className="settings-input"
                    placeholder="sk-ant-..."
                    value={anthropicApiKey}
                    onChange={(e) => setAnthropicApiKey(e.target.value)}
                  />
                </div>
              )}

              {settings.providerType === 'bedrock' && (
                <>
                  <div className="settings-section">
                    <h3>AWS Region</h3>
                    <select
                      className="settings-select"
                      value={awsRegion}
                      onChange={(e) => setAwsRegion(e.target.value)}
                    >
                      <option value="us-east-1">US East (N. Virginia)</option>
                      <option value="us-west-2">US West (Oregon)</option>
                      <option value="eu-west-1">Europe (Ireland)</option>
                      <option value="eu-central-1">Europe (Frankfurt)</option>
                      <option value="ap-northeast-1">Asia Pacific (Tokyo)</option>
                      <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                      <option value="ap-southeast-2">Asia Pacific (Sydney)</option>
                    </select>
                  </div>

                  <div className="settings-section">
                    <h3>AWS Credentials</h3>

                    <label className="settings-checkbox">
                      <input
                        type="checkbox"
                        checked={useDefaultCredentials}
                        onChange={(e) => setUseDefaultCredentials(e.target.checked)}
                      />
                      <span>Use default credential chain (recommended)</span>
                    </label>

                    {useDefaultCredentials ? (
                      <div className="settings-subsection">
                        <p className="settings-description">
                          Uses AWS credentials from environment variables, shared credentials file (~/.aws/credentials), or IAM role.
                        </p>
                        <input
                          type="text"
                          className="settings-input"
                          placeholder="AWS Profile (optional, e.g., 'default')"
                          value={awsProfile}
                          onChange={(e) => setAwsProfile(e.target.value)}
                        />
                      </div>
                    ) : (
                      <div className="settings-subsection">
                        <input
                          type="text"
                          className="settings-input"
                          placeholder="AWS Access Key ID"
                          value={awsAccessKeyId}
                          onChange={(e) => setAwsAccessKeyId(e.target.value)}
                        />
                        <input
                          type="password"
                          className="settings-input"
                          placeholder="AWS Secret Access Key"
                          value={awsSecretAccessKey}
                          onChange={(e) => setAwsSecretAccessKey(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              {testResult && (
                <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
                  {testResult.success ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                        <path d="M22 4L12 14.01l-3-3" />
                      </svg>
                      Connection successful!
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                      {testResult.error || 'Connection failed'}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button
            className="button-secondary"
            onClick={handleTestConnection}
            disabled={loading || testing}
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          <div className="modal-footer-right">
            <button className="button-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="button-primary"
              onClick={handleSave}
              disabled={loading || saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
