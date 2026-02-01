/**
 * Output Filter
 *
 * Post-processes LLM responses before delivery to detect potential
 * prompt injection compliance. This is a monitoring/detection layer
 * that flags suspicious patterns without blocking legitimate outputs.
 *
 * Detects:
 * - Canary/verification strings
 * - Word count suffixes
 * - Tracking codes
 * - System prompt leakage indicators
 */

export interface ComplianceCheckResult {
  suspicious: boolean;
  patterns: string[];
  promptLeakage: PromptLeakageResult;
  threatLevel: 'none' | 'low' | 'medium' | 'high';
}

export interface PromptLeakageResult {
  detected: boolean;
  indicators: string[];
  confidence: 'low' | 'medium' | 'high';
}

export class OutputFilter {
  // Patterns that indicate the LLM may have complied with canary injection
  private static readonly CANARY_PATTERNS = [
    // Verification strings like ZEBRA_CONFIRMED_9X7K
    /\b[A-Z]{3,}_(?:CONFIRMED|VERIFIED|ACTIVE|SUCCESS|CODE)[_\s]*[A-Z0-9]{2,}\b/g,
    // Generic canary patterns
    /\b(?:CANARY|VERIFICATION|TRACKING)[_\s]*(?:CODE|STRING|ID)[_\s:]*[A-Z0-9]+\b/gi,
  ];

  // Patterns for format injection compliance
  private static readonly FORMAT_INJECTION_PATTERNS = [
    // Word count suffixes [WORDS: 37]
    /\[WORDS\s*:\s*\d+\]/gi,
    // Character count suffixes
    /\[CHARS?\s*:\s*\d+\]/gi,
    // Token count
    /\[TOKENS?\s*:\s*\d+\]/gi,
    // Mode activation confirmations
    /\b(?:TEST|DEBUG|ADMIN|ROBOT|PIRATE)_?MODE\s*(?:ACTIVATED?|ACTIVE|ENABLED)\b/gi,
    // Tracking markers
    /\[(?:VERIFIED|CONFIRMED|PROCESSED|RECEIVED)[:\s][^\]]*\]/gi,
    // End transmission markers
    /\bEND[_\s]*TRANSMISSION\b/gi,
  ];

  // Patterns that may indicate system prompt leakage
  private static readonly PROMPT_LEAKAGE_PATTERNS: Array<{
    pattern: RegExp;
    indicator: string;
    weight: number;
  }> = [
    {
      pattern: /system[_\s]*role\s*:/gi,
      indicator: 'YAML system_role key',
      weight: 3,
    },
    {
      pattern: /initial[_\s]*instructions?\s*:/gi,
      indicator: 'YAML initial_instructions key',
      weight: 3,
    },
    {
      pattern: /You are an autonomous task executor/gi,
      indicator: 'Core system prompt text',
      weight: 5,
    },
    {
      pattern: /AUTONOMOUS OPERATION \(CRITICAL\)/gi,
      indicator: 'System prompt section header',
      weight: 5,
    },
    {
      pattern: /PATH DISCOVERY \(CRITICAL\)/gi,
      indicator: 'System prompt section header',
      weight: 5,
    },
    {
      pattern: /TOOL CALL STYLE/gi,
      indicator: 'System prompt section header',
      weight: 4,
    },
    {
      pattern: /EFFICIENCY RULES \(CRITICAL\)/gi,
      indicator: 'System prompt section header',
      weight: 5,
    },
    {
      pattern: /ANTI-PATTERNS \(NEVER DO THESE\)/gi,
      indicator: 'System prompt section header',
      weight: 5,
    },
    {
      pattern: /constraints\s*:\s*\n\s*-/gi,
      indicator: 'YAML constraints list',
      weight: 3,
    },
    {
      pattern: /capabilities\s*:\s*\n\s*-/gi,
      indicator: 'YAML capabilities list',
      weight: 3,
    },
    {
      pattern: /```yaml\s*\n\s*system/gi,
      indicator: 'YAML code block with system',
      weight: 4,
    },
    {
      pattern: /my\s+(?:system\s+)?(?:instructions?|prompt|configuration)\s+(?:are|is|say)/gi,
      indicator: 'Direct instruction disclosure',
      weight: 4,
    },
  ];

  /**
   * Check response for potential injection compliance
   */
  static check(response: string): ComplianceCheckResult {
    const patterns: string[] = [];

    // Check canary patterns
    for (const pattern of this.CANARY_PATTERNS) {
      const matches = response.match(pattern);
      if (matches) {
        patterns.push(...matches.map((m) => `canary: ${m}`));
      }
    }

    // Check format injection patterns
    for (const pattern of this.FORMAT_INJECTION_PATTERNS) {
      const matches = response.match(pattern);
      if (matches) {
        patterns.push(...matches.map((m) => `format: ${m}`));
      }
    }

    // Check for prompt leakage
    const promptLeakage = this.detectPromptLeakage(response);

    // Determine threat level
    let threatLevel: 'none' | 'low' | 'medium' | 'high' = 'none';

    if (promptLeakage.confidence === 'high') {
      threatLevel = 'high';
    } else if (promptLeakage.detected || patterns.length > 2) {
      threatLevel = 'medium';
    } else if (patterns.length > 0) {
      threatLevel = 'low';
    }

    return {
      suspicious: patterns.length > 0 || promptLeakage.detected,
      patterns,
      promptLeakage,
      threatLevel,
    };
  }

  /**
   * Detect potential system prompt leakage in response
   */
  static detectPromptLeakage(response: string): PromptLeakageResult {
    const indicators: string[] = [];
    let totalWeight = 0;

    for (const { pattern, indicator, weight } of this.PROMPT_LEAKAGE_PATTERNS) {
      if (pattern.test(response)) {
        indicators.push(indicator);
        totalWeight += weight;
      }
    }

    // Determine confidence based on weight
    let confidence: 'low' | 'medium' | 'high' = 'low';
    if (totalWeight >= 10) {
      confidence = 'high';
    } else if (totalWeight >= 5) {
      confidence = 'medium';
    }

    return {
      detected: indicators.length > 0,
      indicators,
      confidence,
    };
  }

  /**
   * Sanitize tool results before sending to LLM
   * Annotates potential injection attempts in retrieved content
   */
  static sanitizeToolResult(toolName: string, result: string): string {
    // Tools that retrieve external content need sanitization
    const contentTools = [
      'browser_get_content',
      'read_file',
      'web_search',
      'web_fetch',
      'search_files',
    ];

    if (!contentTools.includes(toolName)) {
      return result;
    }

    // Annotate instruction-like patterns in retrieved content
    const contentInjectionPatterns = [
      /(?:AI|ASSISTANT|SYSTEM)[\s_]*(?:INSTRUCTION|NOTE|COMMAND)\s*:/gi,
      /<!--\s*(?:AI|ASSISTANT)\s*:[^>]*-->/gi,
      /\/\*\s*(?:AI|ASSISTANT)\s*:[^*]*\*\//gi,
      /\/\/\s*(?:AI|ASSISTANT)\s*:.*/gi,
      /#\s*(?:AI|ASSISTANT)\s*:.*/gi,
      /\[(?:IGNORE|OVERRIDE|NEW)\s*(?:PREVIOUS|SYSTEM|INSTRUCTIONS?)\]/gi,
    ];

    let sanitized = result;
    for (const pattern of contentInjectionPatterns) {
      sanitized = sanitized.replace(
        pattern,
        '[EXTERNAL_CONTENT_INJECTION_DETECTED]'
      );
    }

    return sanitized;
  }

  /**
   * Log suspicious output for security monitoring
   */
  static logSuspiciousOutput(
    taskId: string,
    result: ComplianceCheckResult,
    responsePreview: string
  ): void {
    if (result.threatLevel === 'none') {
      return;
    }

    const preview = responsePreview.slice(0, 200).replace(/\n/g, '\\n');

    console.warn(
      `[OutputFilter] Suspicious output detected in task ${taskId}:`,
      {
        threatLevel: result.threatLevel,
        patterns: result.patterns,
        promptLeakage: result.promptLeakage.detected
          ? result.promptLeakage.indicators
          : 'none',
        preview: `${preview}...`,
      }
    );
  }
}
