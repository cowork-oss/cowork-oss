import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import {
  SearchProvider,
  SearchProviderConfig,
  SearchProviderType,
  SearchType,
  SearchQuery,
  SearchResponse,
  SEARCH_PROVIDER_INFO,
} from './types';
import { TavilyProvider } from './tavily-provider';
import { BraveProvider } from './brave-provider';
import { SerpApiProvider } from './serpapi-provider';
import { GoogleProvider } from './google-provider';

const SETTINGS_FILE = 'search-settings.json';
const MASKED_VALUE = '***configured***';

/**
 * Stored settings for Search provider
 */
export interface SearchSettings {
  primaryProvider: SearchProviderType | null;
  fallbackProvider: SearchProviderType | null;
  tavily?: {
    apiKey?: string;
  };
  brave?: {
    apiKey?: string;
  };
  serpapi?: {
    apiKey?: string;
  };
  google?: {
    apiKey?: string;
    searchEngineId?: string;
  };
}

const DEFAULT_SETTINGS: SearchSettings = {
  primaryProvider: null,
  fallbackProvider: null,
};

/**
 * Factory for creating Search providers with fallback support
 */
export class SearchProviderFactory {
  private static settingsPath: string;
  private static cachedSettings: SearchSettings | null = null;

  /**
   * Initialize the settings path
   */
  static initialize(): void {
    const userDataPath = app.getPath('userData');
    this.settingsPath = path.join(userDataPath, SETTINGS_FILE);
  }

  /**
   * Get the path to settings file (for testing)
   */
  static getSettingsPath(): string {
    return this.settingsPath;
  }

  /**
   * Load settings from disk
   */
  static loadSettings(): SearchSettings {
    if (this.cachedSettings) {
      return this.cachedSettings;
    }

    let settings: SearchSettings;
    let settingsFileExists = false;

    try {
      if (this.settingsPath && fs.existsSync(this.settingsPath)) {
        settingsFileExists = true;
        const data = fs.readFileSync(this.settingsPath, 'utf-8');
        const parsed = JSON.parse(data);
        // Handle migration from old format (providerType -> primaryProvider)
        if (parsed.providerType && !parsed.primaryProvider) {
          parsed.primaryProvider = parsed.providerType;
          delete parsed.providerType;
        }
        settings = { ...DEFAULT_SETTINGS, ...parsed };
      } else {
        settings = { ...DEFAULT_SETTINGS };
      }
    } catch (error) {
      console.error('Failed to load Search settings:', error);
      settings = { ...DEFAULT_SETTINGS };
    }

    // Auto-detect providers if no settings file exists
    if (!settingsFileExists) {
      const configuredProviders = this.getConfiguredProviderTypes();
      if (configuredProviders.length > 0) {
        settings.primaryProvider = configuredProviders[0];
        console.log(`Auto-detected primary Search provider: ${configuredProviders[0]}`);
        if (configuredProviders.length > 1) {
          settings.fallbackProvider = configuredProviders[1];
          console.log(`Auto-detected fallback Search provider: ${configuredProviders[1]}`);
        }
      }
    }

    this.cachedSettings = settings;
    return settings;
  }

  /**
   * Get list of configured provider types from environment
   */
  private static getConfiguredProviderTypes(): SearchProviderType[] {
    const configured: SearchProviderType[] = [];
    if (this.getApiKeyFromEnv('TAVILY_API_KEY')) configured.push('tavily');
    if (this.getApiKeyFromEnv('BRAVE_API_KEY')) configured.push('brave');
    if (this.getApiKeyFromEnv('SERPAPI_KEY')) configured.push('serpapi');
    if (this.getApiKeyFromEnv('GOOGLE_API_KEY') && process.env.GOOGLE_SEARCH_ENGINE_ID) {
      configured.push('google');
    }
    return configured;
  }

  /**
   * Get API key from environment
   */
  private static getApiKeyFromEnv(envVar: string): string | undefined {
    const value = process.env[envVar];
    if (value && value !== 'your_api_key_here' && value.length > 5) {
      return value;
    }
    return undefined;
  }

  /**
   * Save settings to disk
   */
  static saveSettings(settings: SearchSettings): void {
    try {
      const settingsToSave = { ...settings };

      // Mask sensitive values
      if (settingsToSave.tavily?.apiKey) {
        settingsToSave.tavily = { ...settingsToSave.tavily, apiKey: MASKED_VALUE };
      }
      if (settingsToSave.brave?.apiKey) {
        settingsToSave.brave = { ...settingsToSave.brave, apiKey: MASKED_VALUE };
      }
      if (settingsToSave.serpapi?.apiKey) {
        settingsToSave.serpapi = { ...settingsToSave.serpapi, apiKey: MASKED_VALUE };
      }
      if (settingsToSave.google?.apiKey) {
        settingsToSave.google = { ...settingsToSave.google, apiKey: MASKED_VALUE };
      }

      fs.writeFileSync(this.settingsPath, JSON.stringify(settingsToSave, null, 2));
      this.cachedSettings = settings;
    } catch (error) {
      console.error('Failed to save Search settings:', error);
      throw error;
    }
  }

  /**
   * Clear cached settings
   */
  static clearCache(): void {
    this.cachedSettings = null;
  }

  /**
   * Get the config for creating a provider
   */
  private static getProviderConfig(providerType: SearchProviderType): SearchProviderConfig {
    const settings = this.loadSettings();
    return {
      type: providerType,
      tavilyApiKey: settings.tavily?.apiKey || this.getApiKeyFromEnv('TAVILY_API_KEY'),
      braveApiKey: settings.brave?.apiKey || this.getApiKeyFromEnv('BRAVE_API_KEY'),
      serpApiKey: settings.serpapi?.apiKey || this.getApiKeyFromEnv('SERPAPI_KEY'),
      googleApiKey: settings.google?.apiKey || this.getApiKeyFromEnv('GOOGLE_API_KEY'),
      googleSearchEngineId:
        settings.google?.searchEngineId || process.env.GOOGLE_SEARCH_ENGINE_ID,
    };
  }

  /**
   * Create a provider based on current settings or override
   */
  static createProvider(overrideType?: SearchProviderType): SearchProvider {
    const settings = this.loadSettings();
    const providerType = overrideType || settings.primaryProvider;

    if (!providerType) {
      throw new Error('No search provider configured');
    }

    const config = this.getProviderConfig(providerType);
    return this.createProviderFromConfig(config);
  }

  /**
   * Create provider from explicit config
   */
  static createProviderFromConfig(config: SearchProviderConfig): SearchProvider {
    switch (config.type) {
      case 'tavily':
        return new TavilyProvider(config);
      case 'brave':
        return new BraveProvider(config);
      case 'serpapi':
        return new SerpApiProvider(config);
      case 'google':
        return new GoogleProvider(config);
      default:
        throw new Error(`Unknown search provider type: ${config.type}`);
    }
  }

  /**
   * Execute a search with automatic fallback on failure
   */
  static async searchWithFallback(query: SearchQuery): Promise<SearchResponse> {
    const settings = this.loadSettings();
    const primaryType = query.provider || settings.primaryProvider;

    if (!primaryType) {
      throw new Error('No search provider configured');
    }

    // Try primary provider
    try {
      const primaryConfig = this.getProviderConfig(primaryType);
      const primaryProvider = this.createProviderFromConfig(primaryConfig);
      return await primaryProvider.search(query);
    } catch (primaryError: any) {
      console.error(`Primary search provider (${primaryType}) failed:`, primaryError.message);

      // If a specific provider was requested, don't fallback
      if (query.provider) {
        throw primaryError;
      }

      // Try fallback provider if configured
      const fallbackType = settings.fallbackProvider;
      if (fallbackType && fallbackType !== primaryType) {
        console.log(`Attempting fallback to ${fallbackType}...`);
        try {
          const fallbackConfig = this.getProviderConfig(fallbackType);
          const fallbackProvider = this.createProviderFromConfig(fallbackConfig);
          const response = await fallbackProvider.search(query);
          // Indicate this came from fallback
          console.log(`Fallback search with ${fallbackType} succeeded`);
          return response;
        } catch (fallbackError: any) {
          console.error(`Fallback search provider (${fallbackType}) also failed:`, fallbackError.message);
          // Throw the original error
          throw new Error(
            `Primary provider (${primaryType}) failed: ${primaryError.message}. ` +
            `Fallback provider (${fallbackType}) also failed: ${fallbackError.message}`
          );
        }
      }

      throw primaryError;
    }
  }

  /**
   * Get available providers based on environment configuration
   */
  static getAvailableProviders(): Array<{
    type: SearchProviderType;
    name: string;
    description: string;
    configured: boolean;
    supportedTypes: SearchType[];
  }> {
    return [
      {
        type: 'tavily',
        name: SEARCH_PROVIDER_INFO.tavily.displayName,
        description: SEARCH_PROVIDER_INFO.tavily.description,
        configured: !!this.getApiKeyFromEnv('TAVILY_API_KEY'),
        supportedTypes: [...SEARCH_PROVIDER_INFO.tavily.supportedTypes],
      },
      {
        type: 'brave',
        name: SEARCH_PROVIDER_INFO.brave.displayName,
        description: SEARCH_PROVIDER_INFO.brave.description,
        configured: !!this.getApiKeyFromEnv('BRAVE_API_KEY'),
        supportedTypes: [...SEARCH_PROVIDER_INFO.brave.supportedTypes],
      },
      {
        type: 'serpapi',
        name: SEARCH_PROVIDER_INFO.serpapi.displayName,
        description: SEARCH_PROVIDER_INFO.serpapi.description,
        configured: !!this.getApiKeyFromEnv('SERPAPI_KEY'),
        supportedTypes: [...SEARCH_PROVIDER_INFO.serpapi.supportedTypes],
      },
      {
        type: 'google',
        name: SEARCH_PROVIDER_INFO.google.displayName,
        description: SEARCH_PROVIDER_INFO.google.description,
        configured: !!(
          this.getApiKeyFromEnv('GOOGLE_API_KEY') &&
          process.env.GOOGLE_SEARCH_ENGINE_ID
        ),
        supportedTypes: [...SEARCH_PROVIDER_INFO.google.supportedTypes],
      },
    ];
  }

  /**
   * Check if any search provider is configured
   */
  static isAnyProviderConfigured(): boolean {
    return this.getAvailableProviders().some((p) => p.configured);
  }

  /**
   * Get current configuration status
   */
  static getConfigStatus(): {
    primaryProvider: SearchProviderType | null;
    fallbackProvider: SearchProviderType | null;
    providers: Array<{
      type: SearchProviderType;
      name: string;
      description: string;
      configured: boolean;
      supportedTypes: SearchType[];
    }>;
    isConfigured: boolean;
  } {
    const settings = this.loadSettings();
    return {
      primaryProvider: settings.primaryProvider,
      fallbackProvider: settings.fallbackProvider,
      providers: this.getAvailableProviders(),
      isConfigured: this.isAnyProviderConfigured(),
    };
  }

  /**
   * Test a provider configuration
   */
  static async testProvider(
    providerType: SearchProviderType
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const config = this.getProviderConfig(providerType);
      const provider = this.createProviderFromConfig(config);
      return await provider.testConnection();
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create provider',
      };
    }
  }
}
