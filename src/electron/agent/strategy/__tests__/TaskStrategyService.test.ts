import { describe, expect, it } from "vitest";
import type { IntentRoute } from "../IntentRouter";
import { TaskStrategyService } from "../TaskStrategyService";

function makeRoute(overrides: Partial<IntentRoute> = {}): IntentRoute {
  return {
    intent: "execution",
    confidence: 0.8,
    conversationMode: "task",
    answerFirst: false,
    signals: [],
    complexity: "low",
    domain: "code",
    ...overrides,
  };
}

describe("TaskStrategyService deriveLlmProfile", () => {
  it("returns strong for planning intent", () => {
    const strategy = TaskStrategyService.derive(makeRoute({ intent: "planning" }));
    expect(strategy.llmProfileHint).toBe("strong");
  });

  it("returns strong for verification tasks regardless of confidence", () => {
    const profile = TaskStrategyService.deriveLlmProfile(
      { executionMode: "execute", preflightRequired: false },
      { intent: "execution", isVerificationTask: true },
    );
    expect(profile).toBe("strong");
  });

  it("returns cheap for routine execution tasks", () => {
    const strategy = TaskStrategyService.derive(makeRoute({ intent: "execution" }));
    expect(strategy.llmProfileHint).toBe("cheap");
  });

  it("returns strong for strict artifact-length execution tasks", () => {
    const strategy = TaskStrategyService.derive(
      makeRoute({ intent: "execution" }),
      undefined,
      {
        title: "Create DOCX",
        prompt:
          "Create an exact 1000 characters long word document (.docx) and verify the final character count.",
      },
    );
    expect(strategy.llmProfileHint).toBe("strong");
  });
});

describe("TaskStrategyService applyToAgentConfig", () => {
  it("adds llmProfileHint when no explicit model override exists", () => {
    const strategy = TaskStrategyService.derive(makeRoute({ intent: "planning" }));
    const config = TaskStrategyService.applyToAgentConfig({}, strategy);
    expect(config.llmProfileHint).toBe("strong");
  });

  it("does not keep llmProfileHint when explicit model override is present", () => {
    const strategy = TaskStrategyService.derive(makeRoute({ intent: "planning" }));
    const config = TaskStrategyService.applyToAgentConfig({ modelKey: "gpt-4o" }, strategy);
    expect(config.llmProfileHint).toBeUndefined();
  });

  it("downshifts stale execute mode for advice intent", () => {
    const route = makeRoute({ intent: "advice" });
    const strategy = TaskStrategyService.derive(route, { executionMode: "execute" });
    expect(strategy.executionMode).toBe("propose");

    const config = TaskStrategyService.applyToAgentConfig({ executionMode: "execute" }, strategy);
    expect(config.executionMode).toBe("propose");
  });

  it("downshifts stale execute mode for chat intent", () => {
    const route = makeRoute({ intent: "chat" });
    const strategy = TaskStrategyService.derive(route, { executionMode: "execute" });
    expect(strategy.executionMode).toBe("analyze");

    const config = TaskStrategyService.applyToAgentConfig({ executionMode: "execute" }, strategy);
    expect(config.executionMode).toBe("analyze");
  });

  it("preserves explicit non-execute override for execution intent", () => {
    const route = makeRoute({ intent: "execution" });
    const strategy = TaskStrategyService.derive(route, { executionMode: "propose" });
    expect(strategy.executionMode).toBe("propose");

    const config = TaskStrategyService.applyToAgentConfig({ executionMode: "propose" }, strategy);
    expect(config.executionMode).toBe("propose");
  });

  it("keeps mixed intent in propose mode without hard execution signals", () => {
    const route = makeRoute({
      intent: "mixed",
      signals: ["strategy-language", "planning-language", "action-verb"],
    });
    const strategy = TaskStrategyService.derive(route);
    expect(strategy.executionMode).toBe("propose");
  });

  it("allows mixed intent to execute with hard execution signals", () => {
    const route = makeRoute({
      intent: "mixed",
      signals: ["action-verb", "execution-target", "path-or-command"],
    });
    const strategy = TaskStrategyService.derive(route);
    expect(strategy.executionMode).toBe("execute");
  });

  it("allows mixed intent to execute with shell troubleshooting signals", () => {
    const route = makeRoute({
      intent: "mixed",
      signals: ["planning-language", "shell-troubleshooting", "terminal-transcript"],
      domain: "operations",
    });
    const strategy = TaskStrategyService.derive(route);
    expect(strategy.executionMode).toBe("execute");
  });

  it("promotes mixed intent maxTurns to 60 with concrete execution signals", () => {
    const route = makeRoute({
      intent: "mixed",
      complexity: "medium",
      signals: ["action-verb", "path-or-command"],
    });

    const strategy = TaskStrategyService.derive(route, undefined, {
      title: "Apply quick fix",
      prompt: "Open src/main.ts and update the config.",
    });

    expect(strategy.maxTurns).toBe(60);
  });

  it("promotes high-complexity workflow-like mixed prompts to 80 turns", () => {
    const route = makeRoute({
      intent: "mixed",
      complexity: "high",
      signals: ["planning-language", "action-verb"],
    });

    const strategy = TaskStrategyService.derive(route, undefined, {
      title: "Ship release patch",
      prompt:
        "Run tests, then update configuration, and then deploy the worker. Finally summarize the rollout.",
    });

    expect(strategy.maxTurns).toBe(80);
  });

  it("forces execute mode and at least 80 turns for build+verify+render artifact prompts", () => {
    const route = makeRoute({
      intent: "mixed",
      complexity: "medium",
      signals: ["planning-language", "action-verb"],
    });

    const strategy = TaskStrategyService.derive(route, undefined, {
      title: "Build and verify widget artifact",
      prompt:
        "Build the widget project, verify it compiles, then render and show the canvas artifact preview.",
    });

    expect(strategy.executionMode).toBe("execute");
    expect(strategy.maxTurns).toBe(80);
    expect(strategy.llmProfileHint).toBe("strong");
  });

  it("forces execute mode, strong profile, and >=80 turns for build+render artifact prompts without explicit verify", () => {
    const route = makeRoute({
      intent: "execution",
      complexity: "medium",
      signals: ["action-verb"],
    });

    const strategy = TaskStrategyService.derive(route, undefined, {
      title: "Build widget and show canvas",
      prompt: "Build a macOS widget and show it in canvas.",
    });

    expect(strategy.executionMode).toBe("execute");
    expect(strategy.maxTurns).toBeGreaterThanOrEqual(80);
    expect(strategy.llmProfileHint).toBe("strong");
  });

  it("escalates llm profile from cheap to strong for low-progress mutation-heavy artifact retries", () => {
    const route = makeRoute({
      intent: "execution",
      complexity: "medium",
      signals: ["action-verb", "path-or-command"],
    });

    const strategy = TaskStrategyService.derive(route, undefined, {
      title: "Retry artifact generation",
      prompt:
        "Create and render a canvas artifact in artifacts/system-metrics-widget-preview.html and verify it updates.",
      lastProgressScore: 0.1,
    });

    expect(strategy.llmProfileHint).toBe("strong");
  });
});
