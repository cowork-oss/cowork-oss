import { Workspace } from '../../../shared/types';
import { AgentDaemon } from '../daemon';
import {
  SearchProviderFactory,
  SearchQuery,
  SearchResponse,
  SearchType,
  SearchProviderType,
} from '../search';

/**
 * SearchTools implements web search operations for the agent
 */
export class SearchTools {
  constructor(
    private workspace: Workspace,
    private daemon: AgentDaemon,
    private taskId: string
  ) {}

  /**
   * Perform a web search with automatic fallback support
   */
  async webSearch(input: {
    query: string;
    searchType?: SearchType;
    maxResults?: number;
    provider?: SearchProviderType;
    dateRange?: 'day' | 'week' | 'month' | 'year';
    region?: string;
  }): Promise<SearchResponse> {
    // Check if any provider is configured
    if (!SearchProviderFactory.isAnyProviderConfigured()) {
      throw new Error(
        'No search provider configured. Set one of: TAVILY_API_KEY, BRAVE_API_KEY, SERPAPI_KEY, or GOOGLE_API_KEY + GOOGLE_SEARCH_ENGINE_ID'
      );
    }

    const settings = SearchProviderFactory.loadSettings();
    if (!settings.primaryProvider && !input.provider) {
      throw new Error(
        'No primary search provider selected. Configure one in Settings > Web Search.'
      );
    }

    const searchQuery: SearchQuery = {
      query: input.query,
      searchType: input.searchType || 'web',
      maxResults: Math.min(input.maxResults || 10, 20), // Cap at 20 results
      dateRange: input.dateRange,
      region: input.region,
      provider: input.provider,
    };

    const providerName = input.provider || settings.primaryProvider || 'unknown';
    this.daemon.logEvent(this.taskId, 'log', {
      message: `Searching ${searchQuery.searchType}: "${input.query}" via ${providerName}`,
    });

    // Use searchWithFallback for automatic fallback support
    const response = await SearchProviderFactory.searchWithFallback(searchQuery);

    this.daemon.logEvent(this.taskId, 'tool_result', {
      tool: 'web_search',
      result: {
        query: input.query,
        searchType: searchQuery.searchType,
        resultCount: response.results.length,
        provider: response.provider,
      },
    });

    return response;
  }
}
