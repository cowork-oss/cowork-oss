import { ConversationMode } from '../../../shared/types';

export type RoutedIntent = 'chat' | 'advice' | 'planning' | 'execution' | 'mixed';

export interface IntentRoute {
  intent: RoutedIntent;
  confidence: number;
  conversationMode: ConversationMode;
  answerFirst: boolean;
  signals: string[];
}

interface IntentScores {
  chat: number;
  advice: number;
  planning: number;
  execution: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class IntentRouter {
  static route(title: string, prompt: string): IntentRoute {
    const text = `${title || ''}\n${prompt || ''}`.trim();
    const lower = text.toLowerCase();
    const scores: IntentScores = { chat: 0, advice: 0, planning: 0, execution: 0 };
    const signals: string[] = [];

    const add = (intent: keyof IntentScores, points: number, signal: string, condition: boolean) => {
      if (!condition) return;
      scores[intent] += points;
      signals.push(signal);
    };

    add(
      'chat',
      3,
      'casual-greeting',
      /^(hi|hey|hello|yo|good morning|good afternoon|good evening|how are you|thanks|thank you)\b/.test(lower.trim())
    );
    add('chat', 2, 'small-talk', /\b(how are you|how's it going|what's up|good night)\b/.test(lower));
    add('advice', 3, 'advice-question', /\b(how should i|what should i|what do you suggest|recommend|advice)\b/.test(lower));
    add('planning', 3, 'strategy-language', /\b(strategy|roadmap|positioning|go to market|gtm|target segment|messaging|kpi|objective)\b/.test(lower));
    add('planning', 2, 'planning-language', /\b(plan|planning|phase|milestone|timeline)\b/.test(lower));
    add('execution', 3, 'action-verb', /\b(create|build|edit|write|fix|deploy|run|install|execute|open|search|fetch|schedule|configure|implement|check|read|review|find|analyze|examine|inspect|list|show|scan|look|update|modify|delete|remove|rename|move|copy|test|verify|continue)\b/.test(lower));
    add('execution', 2, 'execution-target', /\b(files?|folders?|repos?|projects?|commands?|scripts?|code|apps?|databases?|tests?|workspaces?|docs?|documents?|directories?|packages?)\b/.test(lower));
    add('execution', 2, 'path-or-command', /`[^`]+`|\/[a-z0-9_.\-\/]+|\bnpm\b|\byarn\b|\bpnpm\b|\bgit\b/.test(lower));
    add('advice', 1, 'question-form', /\?/.test(text));

    const planningLike = scores.planning + scores.advice;
    const executionLike = scores.execution;
    const chatLike = scores.chat;

    let intent: RoutedIntent;
    if (chatLike >= 3 && planningLike === 0 && executionLike === 0) {
      intent = 'chat';
    } else if (planningLike >= 3 && executionLike >= 3) {
      intent = 'mixed';
    } else if (scores.planning >= scores.advice && scores.planning >= 3) {
      intent = 'planning';
    } else if (scores.advice >= 3 && executionLike === 0) {
      intent = 'advice';
    } else if (executionLike >= 3) {
      intent = 'execution';
    } else if (planningLike >= 2) {
      intent = 'advice';
    } else {
      intent = 'chat';
    }

    const confidenceBase = Math.max(chatLike, planningLike, executionLike);
    const confidenceSpread = Math.abs((planningLike + executionLike) - chatLike);
    const confidence = clamp(0.55 + confidenceBase * 0.08 + confidenceSpread * 0.02, 0.55, 0.95);

    const conversationMode: ConversationMode =
      intent === 'chat' ? 'chat' : intent === 'execution' ? 'task' : 'hybrid';

    const answerFirst = intent === 'advice' || intent === 'planning' || intent === 'mixed';

    return {
      intent,
      confidence,
      conversationMode,
      answerFirst,
      signals,
    };
  }
}

