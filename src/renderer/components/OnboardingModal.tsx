import { useState, useEffect } from 'react';
import { ThemeMode, AccentColor, ACCENT_COLORS, LLMSettingsData } from '../../shared/types';

interface OnboardingModalProps {
  onComplete: () => void;
  themeMode: ThemeMode;
  accentColor: AccentColor;
  onThemeChange: (theme: ThemeMode) => void;
  onAccentChange: (accent: AccentColor) => void;
}

type OnboardingStep = 'welcome' | 'llm';

// LLM Provider types for the simplified setup
type LLMProviderType = 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'openrouter' | 'bedrock';

interface ProviderOption {
  type: LLMProviderType;
  name: string;
  description: string;
  icon: JSX.Element;
  requiresApiKey: boolean;
  apiKeyPlaceholder?: string;
  apiKeyLink?: string;
  freeOption?: boolean;
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    type: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models (Recommended)',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
    requiresApiKey: true,
    apiKeyPlaceholder: 'sk-ant-...',
    apiKeyLink: 'https://console.anthropic.com/',
  },
  {
    type: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o and other models',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
    requiresApiKey: true,
    apiKeyPlaceholder: 'sk-...',
    apiKeyLink: 'https://platform.openai.com/api-keys',
  },
  {
    type: 'gemini',
    name: 'Google Gemini',
    description: 'Gemini 2.0 and other models',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    requiresApiKey: true,
    apiKeyPlaceholder: 'AIza...',
    apiKeyLink: 'https://aistudio.google.com/apikey',
  },
  {
    type: 'ollama',
    name: 'Ollama',
    description: 'Run models locally (Free)',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M9 9h6v6H9z" />
      </svg>
    ),
    requiresApiKey: false,
    freeOption: true,
  },
  {
    type: 'openrouter',
    name: 'OpenRouter',
    description: 'Access 200+ models',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    requiresApiKey: true,
    apiKeyPlaceholder: 'sk-or-...',
    apiKeyLink: 'https://openrouter.ai/keys',
  },
  {
    type: 'bedrock',
    name: 'AWS Bedrock',
    description: 'Claude via AWS',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
    ),
    requiresApiKey: false, // Uses AWS credentials
  },
];

export function OnboardingModal({
  onComplete,
  themeMode,
  accentColor,
  onThemeChange,
  onAccentChange,
}: OnboardingModalProps) {
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [selectedProvider, setSelectedProvider] = useState<LLMProviderType | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  // Check if Ollama is available locally when selected
  useEffect(() => {
    if (selectedProvider === 'ollama') {
      checkOllamaAvailability();
    }
  }, [selectedProvider]);

  const checkOllamaAvailability = async () => {
    try {
      const models = await window.electronAPI.getOllamaModels(ollamaUrl);
      if (models && models.length > 0) {
        setTestResult({ success: true });
      }
    } catch {
      // Ollama not running - that's fine, user can set it up later
    }
  };

  const handleProviderSelect = (provider: LLMProviderType) => {
    setSelectedProvider(provider);
    setApiKey('');
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    if (!selectedProvider) return;

    try {
      setTestResult(null);
      const testConfig: Partial<LLMSettingsData> = {
        providerType: selectedProvider,
      };

      if (selectedProvider === 'anthropic') {
        testConfig.anthropic = { apiKey };
      } else if (selectedProvider === 'openai') {
        testConfig.openai = { apiKey, authMethod: 'api_key' };
      } else if (selectedProvider === 'gemini') {
        testConfig.gemini = { apiKey };
      } else if (selectedProvider === 'openrouter') {
        testConfig.openrouter = { apiKey };
      } else if (selectedProvider === 'ollama') {
        testConfig.ollama = { baseUrl: ollamaUrl };
      }

      const result = await window.electronAPI.testLLMProvider(testConfig);
      setTestResult(result);
    } catch (error: any) {
      setTestResult({ success: false, error: error.message });
    }
  };

  const handleSaveAndContinue = async () => {
    if (!selectedProvider) {
      // Skip LLM setup for now
      onComplete();
      return;
    }

    try {
      setSaving(true);

      const settings: LLMSettingsData = {
        providerType: selectedProvider,
        modelKey: getDefaultModel(selectedProvider),
      };

      if (selectedProvider === 'anthropic') {
        settings.anthropic = { apiKey };
      } else if (selectedProvider === 'openai') {
        settings.openai = { apiKey, authMethod: 'api_key', model: 'gpt-4o-mini' };
      } else if (selectedProvider === 'gemini') {
        settings.gemini = { apiKey, model: 'gemini-2.0-flash' };
      } else if (selectedProvider === 'openrouter') {
        settings.openrouter = { apiKey, model: 'anthropic/claude-3.5-sonnet' };
      } else if (selectedProvider === 'ollama') {
        settings.ollama = { baseUrl: ollamaUrl, model: 'llama3.2' };
      } else if (selectedProvider === 'bedrock') {
        settings.bedrock = { region: 'us-east-1', useDefaultCredentials: true };
      }

      await window.electronAPI.saveLLMSettings(settings);
      onComplete();
    } catch (error) {
      console.error('Failed to save LLM settings:', error);
      onComplete(); // Continue anyway
    } finally {
      setSaving(false);
    }
  };

  const getDefaultModel = (provider: LLMProviderType): string => {
    switch (provider) {
      case 'anthropic':
        return 'sonnet-4';
      case 'openai':
        return 'gpt-4o-mini';
      case 'gemini':
        return 'gemini-2.0-flash';
      case 'ollama':
        return 'llama3.2';
      case 'openrouter':
        return 'anthropic/claude-3.5-sonnet';
      case 'bedrock':
        return 'sonnet-4';
      default:
        return 'sonnet-4';
    }
  };

  const canProceed = () => {
    if (!selectedProvider) return true; // Can skip
    if (selectedProvider === 'ollama' || selectedProvider === 'bedrock') return true;
    return apiKey.length > 0;
  };

  const selectedProviderInfo = PROVIDER_OPTIONS.find(p => p.type === selectedProvider);

  return (
    <div className="onboarding-modal">
      <div className="onboarding-container">
        {/* Progress indicator */}
        <div className="onboarding-progress">
          <div className={`onboarding-progress-step ${step === 'welcome' ? 'active' : 'completed'}`}>
            <span className="onboarding-progress-dot" />
            <span className="onboarding-progress-label">Welcome</span>
          </div>
          <div className="onboarding-progress-line" />
          <div className={`onboarding-progress-step ${step === 'llm' ? 'active' : ''}`}>
            <span className="onboarding-progress-dot" />
            <span className="onboarding-progress-label">AI Setup</span>
          </div>
        </div>

        {/* Step Content */}
        {step === 'welcome' && (
          <div className="onboarding-step">
            <div className="onboarding-header">
              <h1>Welcome to CoWork OS</h1>
              <p>Let's personalize your experience and get you started.</p>
            </div>

            <div className="onboarding-section">
              <h3>Choose your theme</h3>
              <div className="onboarding-theme-options">
                <button
                  className={`onboarding-theme-option ${themeMode === 'light' ? 'selected' : ''}`}
                  onClick={() => onThemeChange('light')}
                >
                  <div className="onboarding-theme-preview light">
                    <div className="preview-line" />
                    <div className="preview-line" />
                    <div className="preview-line" />
                  </div>
                  <span>Light</span>
                </button>
                <button
                  className={`onboarding-theme-option ${themeMode === 'dark' ? 'selected' : ''}`}
                  onClick={() => onThemeChange('dark')}
                >
                  <div className="onboarding-theme-preview dark">
                    <div className="preview-line" />
                    <div className="preview-line" />
                    <div className="preview-line" />
                  </div>
                  <span>Dark</span>
                </button>
                <button
                  className={`onboarding-theme-option ${themeMode === 'system' ? 'selected' : ''}`}
                  onClick={() => onThemeChange('system')}
                >
                  <div className="onboarding-theme-preview system" />
                  <span>System</span>
                </button>
              </div>
            </div>

            <div className="onboarding-section">
              <h3>Pick an accent color</h3>
              <div className="onboarding-color-grid">
                {ACCENT_COLORS.map((color) => (
                  <button
                    key={color.id}
                    className={`onboarding-color-option ${accentColor === color.id ? 'selected' : ''}`}
                    onClick={() => onAccentChange(color.id)}
                    title={color.label}
                  >
                    <div className={`onboarding-color-swatch ${color.id}`} />
                  </button>
                ))}
              </div>
            </div>

            <div className="onboarding-actions">
              <button className="onboarding-btn-primary" onClick={() => setStep('llm')}>
                Continue
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {step === 'llm' && (
          <div className="onboarding-step">
            <div className="onboarding-header">
              <h1>Connect an AI Provider</h1>
              <p>Choose which AI service to use for running tasks.</p>
            </div>

            <div className="onboarding-provider-grid">
              {PROVIDER_OPTIONS.map((provider) => (
                <button
                  key={provider.type}
                  className={`onboarding-provider-card ${selectedProvider === provider.type ? 'selected' : ''}`}
                  onClick={() => handleProviderSelect(provider.type)}
                >
                  <div className="onboarding-provider-icon">{provider.icon}</div>
                  <div className="onboarding-provider-info">
                    <span className="onboarding-provider-name">
                      {provider.name}
                      {provider.freeOption && <span className="onboarding-free-badge">Free</span>}
                    </span>
                    <span className="onboarding-provider-desc">{provider.description}</span>
                  </div>
                  {selectedProvider === provider.type && (
                    <svg className="onboarding-check" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                      <path d="M22 4L12 14.01l-3-3" />
                    </svg>
                  )}
                </button>
              ))}
            </div>

            {/* API Key input for selected provider */}
            {selectedProvider && selectedProviderInfo?.requiresApiKey && (
              <div className="onboarding-apikey-section">
                <label>
                  {selectedProviderInfo.name} API Key
                  {selectedProviderInfo.apiKeyLink && (
                    <a
                      href={selectedProviderInfo.apiKeyLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="onboarding-link"
                    >
                      Get one here
                    </a>
                  )}
                </label>
                <div className="onboarding-apikey-row">
                  <input
                    type="password"
                    placeholder={selectedProviderInfo.apiKeyPlaceholder}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="onboarding-input"
                  />
                  <button
                    className="onboarding-btn-secondary"
                    onClick={handleTestConnection}
                    disabled={!apiKey}
                  >
                    Test
                  </button>
                </div>
                {testResult && (
                  <div className={`onboarding-test-result ${testResult.success ? 'success' : 'error'}`}>
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
              </div>
            )}

            {/* Ollama-specific section */}
            {selectedProvider === 'ollama' && (
              <div className="onboarding-apikey-section">
                <label>Ollama Server URL</label>
                <div className="onboarding-apikey-row">
                  <input
                    type="text"
                    placeholder="http://localhost:11434"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    className="onboarding-input"
                  />
                  <button className="onboarding-btn-secondary" onClick={checkOllamaAvailability}>
                    Test
                  </button>
                </div>
                <p className="onboarding-hint">
                  Make sure Ollama is running. Download from{' '}
                  <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer">
                    ollama.ai
                  </a>
                </p>
                {testResult && (
                  <div className={`onboarding-test-result ${testResult.success ? 'success' : 'error'}`}>
                    {testResult.success ? 'Ollama server detected!' : 'Ollama not detected. You can set it up later.'}
                  </div>
                )}
              </div>
            )}

            {/* Bedrock-specific section */}
            {selectedProvider === 'bedrock' && (
              <div className="onboarding-apikey-section">
                <p className="onboarding-hint">
                  AWS Bedrock uses your AWS credentials from ~/.aws/credentials or environment variables.
                  You can configure this in detail in Settings after setup.
                </p>
              </div>
            )}

            <div className="onboarding-actions">
              <button className="onboarding-btn-secondary" onClick={() => setStep('welcome')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <button
                className="onboarding-btn-primary"
                onClick={handleSaveAndContinue}
                disabled={saving || !canProceed()}
              >
                {saving ? 'Saving...' : selectedProvider ? 'Finish Setup' : 'Skip for Now'}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {!selectedProvider && (
              <p className="onboarding-skip-hint">
                You can configure this later in Settings
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
