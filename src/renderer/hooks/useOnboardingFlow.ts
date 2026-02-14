import { useState, useCallback, useEffect, useRef } from 'react';
import type { LLMProviderType, PersonaId } from '../../shared/types';

// Onboarding conversation states
export type OnboardingState =
  | 'dormant'
  | 'awakening'
  | 'greeting'
  | 'ask_name'
  | 'confirm_name'
  | 'ask_persona'
  | 'confirm_persona'
  | 'ask_voice'
  | 'confirm_voice'
  | 'ask_work_style'
  | 'reflect_style'
  | 'transition_setup'
  | 'llm_setup'
  | 'llm_api_key'
  | 'llm_testing'
  | 'llm_confirmed'
  | 'completion'
  | 'transitioning';

// Conversation script - personal, like the agent was made for this user
const SCRIPT = {
  greeting: [
    'Initializing...',
    "There you are.",
    "I was built just for you. Thanks for waking me up.",
  ],
  ask_name: "Before we start — what should I call myself?",
  confirm_name: (name: string) =>
    name
      ? `${name}. That feels right. I'll remember that.`
      : "I'll go by CoWork then. Simple and ready.",
  ask_persona: "How should I show up for you?",
  confirm_persona_companion: "Then I'll be warm, curious, and present as we work together.",
  confirm_persona_neutral: "Understood. I'll keep things focused and understated.",
  ask_voice: "Want me to speak responses out loud when it helps?",
  confirm_voice_on: "Okay. I'll use voice when I respond.",
  confirm_voice_off: "All good. We can keep it text-only for now.",
  ask_work_style:
    "I want to work the way you do. Do you like having a clear plan, or do you prefer staying flexible?",
  reflect_style_planner:
    "Understood. I'll keep things organized and give you clarity.",
  reflect_style_flexible:
    "Got it. I'll stay loose and adapt as we go.",
  // Implications shown after work style selection
  style_implications_planner: [
    "• I'll create step-by-step plans before starting",
    "• You'll see clear progress updates along the way",
  ],
  style_implications_flexible: [
    "• I'll jump in and adapt as I learn more",
    "• Less upfront planning, more iterating",
    "• Quick responses with room to adjust",
  ],
  transition_setup:
    "One more thing — I need a brain to think with. Which AI should power me?",
  llm_intro:
    "Each one thinks a little differently. Pick whichever feels right.",
  llm_selected: (provider: string) => {
    const responses: Record<string, string> = {
      anthropic: "Claude. That's a good match for us.",
      openai: "OpenAI. Classic and reliable.",
      gemini: "Gemini. Let's see what we can do together.",
      ollama: "Local with Ollama. I like the privacy.",
      openrouter: "OpenRouter. Lots of options to explore.",
      bedrock: "AWS Bedrock. Enterprise-ready.",
      groq: "Groq. Speedy and efficient.",
      xai: "Grok. Let's put xAI to work.",
      kimi: "Kimi. Solid choice.",
    };
    return responses[provider] || "Good choice.";
  },
  llm_need_key: "I'll need an API key to connect. You can get one from their site.",
  llm_testing: "Connecting...",
  llm_success: "We're linked. I can think now.",
  llm_error: "Couldn't connect. Want to try a different key?",
  completion: (name: string) =>
    `I'm ready${name ? `, ${name}` : ''}. Let's build something together.`,
};

interface UseOnboardingOptions {
  onComplete: (dontShowAgain: boolean) => void;
}

interface OnboardingData {
  assistantName: string;
  persona: PersonaId;
  voiceEnabled: boolean | null;
  workStyle: 'planner' | 'flexible' | null;
  selectedProvider: LLMProviderType | null;
  apiKey: string;
  ollamaUrl: string;
}

export function useOnboardingFlow({ onComplete }: UseOnboardingOptions) {
  const [state, setState] = useState<OnboardingState>('dormant');
  const [currentText, setCurrentText] = useState('');
  const [greetingIndex, setGreetingIndex] = useState(0);
  const [showInput, setShowInput] = useState(false);
  const [showProviders, setShowProviders] = useState(false);
  const [showApiInput, setShowApiInput] = useState(false);
  const [showStyleImplications, setShowStyleImplications] = useState(false);
  const [showPersonaOptions, setShowPersonaOptions] = useState(false);
  const [showVoiceOptions, setShowVoiceOptions] = useState(false);
  const [styleCountdown, setStyleCountdown] = useState(0);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);

  const [data, setData] = useState<OnboardingData>({
    assistantName: '',
    persona: 'companion',
    voiceEnabled: null,
    workStyle: null,
    selectedProvider: null,
    apiKey: '',
    ollamaUrl: 'http://localhost:11434',
  });

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Helper to delay state transitions
  const delayedTransition = useCallback(
    (nextState: OnboardingState, delay: number) => {
      timeoutRef.current = setTimeout(() => {
        setState(nextState);
      }, delay);
    },
    []
  );

  // Start the onboarding
  const start = useCallback(() => {
    setState('dormant');
    // Small delay before awakening
    delayedTransition('awakening', 500);
  }, [delayedTransition]);

  // Handle awakening animation complete
  const onAwakeningComplete = useCallback(() => {
    setState('greeting');
    setCurrentText(SCRIPT.greeting[0]);
    setGreetingIndex(0);
  }, []);

  // Handle typewriter complete for each state
  const onTextComplete = useCallback(() => {
    switch (state) {
      case 'greeting':
        if (greetingIndex < SCRIPT.greeting.length - 1) {
          // Show next greeting line
          timeoutRef.current = setTimeout(() => {
            setGreetingIndex((i) => i + 1);
            setCurrentText(SCRIPT.greeting[greetingIndex + 1]);
          }, 800);
        } else {
          // Move to ask name
          timeoutRef.current = setTimeout(() => {
            setState('ask_name');
            setCurrentText(SCRIPT.ask_name);
            setShowInput(true);
          }, 1000);
        }
        break;

      case 'confirm_name':
        timeoutRef.current = setTimeout(() => {
          setState('ask_persona');
          setCurrentText(SCRIPT.ask_persona);
          setShowPersonaOptions(true);
        }, 1200);
        break;

      case 'confirm_persona':
        timeoutRef.current = setTimeout(() => {
          setState('ask_voice');
          setCurrentText(SCRIPT.ask_voice);
          setShowVoiceOptions(true);
        }, 1200);
        break;

      case 'confirm_voice':
        timeoutRef.current = setTimeout(() => {
          setState('ask_work_style');
          setCurrentText(SCRIPT.ask_work_style);
          setShowInput(true);
        }, 1200);
        break;

      case 'reflect_style':
        // Show implications after reflection text completes
        timeoutRef.current = setTimeout(() => {
          setShowStyleImplications(true);
          setStyleCountdown(4);
          // Start countdown
          const countdownInterval = setInterval(() => {
            setStyleCountdown((prev) => {
              if (prev <= 1) {
                clearInterval(countdownInterval);
                // Auto-progress to next step
                setShowStyleImplications(false);
                setState('transition_setup');
                setCurrentText(SCRIPT.transition_setup);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
          // Store interval ref for cleanup
          timeoutRef.current = countdownInterval as unknown as NodeJS.Timeout;
        }, 800);
        break;

      case 'transition_setup':
        timeoutRef.current = setTimeout(() => {
          setState('llm_setup');
          setCurrentText(SCRIPT.llm_intro);
          setShowProviders(true);
        }, 1500);
        break;

      case 'llm_confirmed':
        timeoutRef.current = setTimeout(() => {
          setState('completion');
          setCurrentText(SCRIPT.completion(data.assistantName));
        }, 1000);
        break;

      case 'completion':
        timeoutRef.current = setTimeout(() => {
          setState('transitioning');
          // Call onComplete after transition animation
          timeoutRef.current = setTimeout(() => {
            onComplete(true);
          }, 800);
        }, 2000);
        break;
    }
  }, [state, greetingIndex, data.assistantName, onComplete]);

  // Handle user name input
  const submitName = useCallback((name: string) => {
    setShowInput(false);
    const trimmedName = name.trim();
    setData((d) => ({
      ...d,
      assistantName: trimmedName || 'CoWork',
    }));
    setState('confirm_name');
    setCurrentText(SCRIPT.confirm_name(trimmedName));
  }, []);

  // Handle persona selection
  const submitPersona = useCallback((persona: PersonaId) => {
    setShowPersonaOptions(false);
    setData((d) => ({ ...d, persona }));
    setState('confirm_persona');
    setCurrentText(
      persona === 'companion'
        ? SCRIPT.confirm_persona_companion
        : SCRIPT.confirm_persona_neutral
    );

    if (window.electronAPI?.setActivePersona) {
      void window.electronAPI.setActivePersona(persona).catch((error) => {
        console.error('Failed to set persona during onboarding:', error);
      });
    }
  }, []);

  // Handle voice preference selection
  const submitVoicePreference = useCallback(async (enabled: boolean) => {
    setShowVoiceOptions(false);
    setData((d) => ({ ...d, voiceEnabled: enabled }));
    setState('confirm_voice');
    setCurrentText(enabled ? SCRIPT.confirm_voice_on : SCRIPT.confirm_voice_off);

    if (enabled && window.electronAPI?.saveVoiceSettings) {
      try {
        await window.electronAPI.saveVoiceSettings({
          enabled: true,
          responseMode: 'auto',
        });
      } catch (error) {
        console.error('Failed to enable voice during onboarding:', error);
      }
    }
  }, []);

  // Handle work style selection
  const submitWorkStyle = useCallback((style: 'planner' | 'flexible') => {
    setShowInput(false);
    setShowStyleImplications(false);
    setStyleCountdown(0);
    setData((d) => ({ ...d, workStyle: style }));
    setState('reflect_style');
    setCurrentText(
      style === 'planner'
        ? SCRIPT.reflect_style_planner
        : SCRIPT.reflect_style_flexible
    );
  }, []);

  // Allow user to change work style before timeout
  const changeWorkStyle = useCallback(() => {
    // Clear any running countdown/timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      // Also try to clear as interval (countdown uses setInterval)
      window.clearInterval(timeoutRef.current as unknown as number);
    }
    setShowStyleImplications(false);
    setStyleCountdown(0);
    setData((d) => ({ ...d, workStyle: null }));
    setState('ask_work_style');
    setCurrentText(SCRIPT.ask_work_style);
    setShowInput(true);
  }, []);

  // Get default model for a provider
  const getDefaultModel = useCallback((provider: LLMProviderType): string => {
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
        return 'sonnet-4-5';
      case 'groq':
        return 'llama-3.1-8b-instant';
      case 'xai':
        return 'grok-4-fast-non-reasoning';
      case 'kimi':
        return 'kimi-k2.5';
      default:
        return 'sonnet-4';
    }
  }, []);

  // Build test config for a provider
  const buildTestConfig = useCallback(
    (provider: LLMProviderType, apiKey: string) => {
      const testConfig: Record<string, unknown> = {
        providerType: provider,
      };

      if (provider === 'anthropic') {
        testConfig.anthropic = { apiKey };
      } else if (provider === 'openai') {
        testConfig.openai = { apiKey, authMethod: 'api_key' };
      } else if (provider === 'gemini') {
        testConfig.gemini = { apiKey };
      } else if (provider === 'openrouter') {
        testConfig.openrouter = { apiKey };
      } else if (provider === 'ollama') {
        testConfig.ollama = { baseUrl: data.ollamaUrl };
      } else if (provider === 'groq') {
        testConfig.groq = { apiKey };
      } else if (provider === 'xai') {
        testConfig.xai = { apiKey };
      } else if (provider === 'kimi') {
        testConfig.kimi = { apiKey };
      }

      return testConfig;
    },
    [data.ollamaUrl]
  );

  // Build save settings for a provider
  const buildSaveSettings = useCallback(
    (provider: LLMProviderType, apiKey: string) => {
      const settings: Record<string, unknown> = {
        providerType: provider,
        modelKey: getDefaultModel(provider),
      };

      if (provider === 'anthropic') {
        settings.anthropic = { apiKey };
      } else if (provider === 'openai') {
        settings.openai = { apiKey, authMethod: 'api_key', model: 'gpt-4o-mini' };
      } else if (provider === 'gemini') {
        settings.gemini = { apiKey, model: 'gemini-2.0-flash' };
      } else if (provider === 'openrouter') {
        settings.openrouter = { apiKey, model: 'anthropic/claude-3.5-sonnet' };
      } else if (provider === 'ollama') {
        settings.ollama = { baseUrl: data.ollamaUrl, model: 'llama3.2' };
      } else if (provider === 'bedrock') {
        settings.bedrock = { region: 'us-east-1', useDefaultCredentials: true };
      } else if (provider === 'groq') {
        settings.groq = { apiKey, model: 'llama-3.1-8b-instant' };
      } else if (provider === 'xai') {
        settings.xai = { apiKey, model: 'grok-4-fast-non-reasoning' };
      } else if (provider === 'kimi') {
        settings.kimi = { apiKey, model: 'kimi-k2.5' };
      }

      return settings;
    },
    [data.ollamaUrl, getDefaultModel]
  );

  // Handle provider selection
  const selectProvider = useCallback(
    async (provider: LLMProviderType) => {
      setData((d) => ({ ...d, selectedProvider: provider }));
      setCurrentText(SCRIPT.llm_selected(provider));

      // After showing the response, show API key input (except for Ollama/Bedrock)
      timeoutRef.current = setTimeout(async () => {
        if (provider === 'ollama' || provider === 'bedrock') {
          // For Ollama/Bedrock, skip API key and save settings directly
          setShowProviders(false);

          // Save settings for these providers
          const settings = buildSaveSettings(provider, '');
          try {
            await window.electronAPI.saveLLMSettings(settings);
            setState('llm_confirmed');
            setCurrentText(SCRIPT.llm_success);
          } catch {
            // Even if save fails, proceed to completion
            setState('completion');
            setCurrentText(SCRIPT.completion(data.assistantName));
          }
        } else {
          setState('llm_api_key');
          setCurrentText(SCRIPT.llm_need_key);
          setShowApiInput(true);
        }
      }, 1500);
    },
    [buildSaveSettings, data.assistantName]
  );

  // Handle API key submission
  const submitApiKey = useCallback(
    async (key: string) => {
      setShowApiInput(false);
      setShowProviders(false);
      setData((d) => ({ ...d, apiKey: key }));
      setState('llm_testing');
      setCurrentText(SCRIPT.llm_testing);

      // Test the connection
      try {
        const testConfig = buildTestConfig(data.selectedProvider!, key);
        const result = await window.electronAPI.testLLMProvider(testConfig);

        if (result.success) {
          // Save the LLM settings
          const saveSettings = buildSaveSettings(data.selectedProvider!, key);
          await window.electronAPI.saveLLMSettings(saveSettings);

          setTestResult({ success: true });
          setState('llm_confirmed');
          setCurrentText(SCRIPT.llm_success);
        } else {
          setTestResult({ success: false, error: result.error });
          setCurrentText(SCRIPT.llm_error);
          setShowApiInput(true);
        }
      } catch (error) {
        setTestResult({
          success: false,
          error: error instanceof Error ? error.message : 'Connection failed',
        });
        setCurrentText(SCRIPT.llm_error);
        setShowApiInput(true);
      }
    },
    [data.selectedProvider, buildTestConfig, buildSaveSettings]
  );

  // Skip LLM setup
  const skipLLMSetup = useCallback(() => {
    setShowProviders(false);
    setShowApiInput(false);
    setState('completion');
    setCurrentText(SCRIPT.completion(data.assistantName));
  }, [data.assistantName]);

  // Save onboarding choices to settings
  const saveOnboardingSettings = useCallback(async () => {
    const name = data.assistantName || 'CoWork';
    try {
      // Save to AppearanceSettings (for backward compatibility)
      const currentAppearance = await window.electronAPI.getAppearanceSettings();
      await window.electronAPI.saveAppearanceSettings({
        ...currentAppearance,
        assistantName: name,
      });

      // Save to PersonalitySettings (primary location for agent identity)
      const currentPersonality = await window.electronAPI.getPersonalitySettings();
      await window.electronAPI.savePersonalitySettings({
        ...currentPersonality,
        agentName: name,
        workStyle: data.workStyle || undefined,
        activePersona: data.persona || currentPersonality.activePersona,
      });
    } catch (error) {
      console.error('Failed to save onboarding settings:', error);
    }
  }, [data.assistantName, data.workStyle]);

  // Save settings when we reach completion
  useEffect(() => {
    if (state === 'completion') {
      saveOnboardingSettings();
    }
  }, [state, saveOnboardingSettings]);

  return {
    // State
    state,
    currentText,
    showInput,
    showProviders,
    showApiInput,
    showStyleImplications,
    showPersonaOptions,
    showVoiceOptions,
    styleCountdown,
    testResult,
    data,

    // Actions
    start,
    onAwakeningComplete,
    onTextComplete,
    submitName,
    submitPersona,
    submitVoicePreference,
    submitWorkStyle,
    changeWorkStyle,
    selectProvider,
    submitApiKey,
    skipLLMSetup,

    // Update functions
    setApiKey: (key: string) => setData((d) => ({ ...d, apiKey: key })),
    setOllamaUrl: (url: string) => setData((d) => ({ ...d, ollamaUrl: url })),
  };
}

export { SCRIPT };
export default useOnboardingFlow;
