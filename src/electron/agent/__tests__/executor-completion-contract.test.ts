import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskExecutor } from "../executor";

type HarnessOptions = {
  prompt: string;
  rawPrompt?: string;
  title?: string;
  lastOutput: string;
  createdFiles?: string[];
  planStepDescription?: string;
  source?: "manual" | "cron" | "hook" | "api";
};

function createExecuteHarness(options: HarnessOptions) {
  const executor = Object.create(TaskExecutor.prototype) as Any;
  const stepDescription = options.planStepDescription || "Do the task";

  executor.task = {
    id: "task-1",
    title: options.title || "Test task",
    prompt: options.prompt,
    ...(options.rawPrompt ? { rawPrompt: options.rawPrompt } : {}),
    createdAt: Date.now() - 1000,
    currentAttempt: 0,
    maxAttempts: 1,
    ...(options.source ? { source: options.source } : {}),
  };
  executor.workspace = {
    id: "workspace-1",
    path: "/tmp",
    isTemp: false,
    permissions: { read: true, write: true, delete: true, network: true, shell: true },
  };
  executor.daemon = {
    logEvent: vi.fn(),
    updateTaskStatus: vi.fn(),
    updateTask: vi.fn(),
    completeTask: vi.fn(),
    getTaskEvents: vi.fn().mockReturnValue([]),
    handleTransientTaskFailure: vi.fn().mockReturnValue(false),
    dispatchMentionedAgents: vi.fn(),
    getAgentRoleById: vi.fn().mockReturnValue(null),
  };
  executor.toolRegistry = {
    cleanup: vi.fn(async () => undefined),
  };
  executor.fileOperationTracker = {
    getCreatedFiles: vi.fn().mockReturnValue(options.createdFiles || []),
    getKnowledgeSummary: vi.fn().mockReturnValue(""),
  };
  executor.contextManager = {
    getAvailableTokens: vi.fn().mockReturnValue(1000000),
    compactMessagesWithMeta: vi.fn((messages: Any) => ({ messages, meta: { kind: "none" } })),
  };
  executor.provider = { createMessage: vi.fn() };
  executor.abortController = new AbortController();
  executor.cancelled = false;
  executor.waitingForUserInput = false;
  executor.requiresTestRun = false;
  executor.testRunObserved = false;
  executor.partialSuccessForCronEnabled = true;
  executor.taskCompleted = false;
  executor.lastAssistantOutput = options.lastOutput;
  executor.lastNonVerificationOutput = options.lastOutput;
  executor.lastAssistantText = options.lastOutput;
  executor.saveConversationSnapshot = vi.fn();
  executor.maybeHandleScheduleSlashCommand = vi.fn(async () => false);
  executor.isCompanionPrompt = vi.fn().mockReturnValue(false);
  executor.analyzeTask = vi.fn(async () => ({}));
  executor.dispatchMentionedAgentsAfterPlanning = vi.fn(async () => undefined);
  executor.verifySuccessCriteria = vi.fn(async () => ({ success: true, message: "ok" }));
  executor.isTransientProviderError = vi.fn().mockReturnValue(false);
  executor.executePlan = vi.fn(async function executePlanStub(this: Any) {
    const current = this.plan?.steps?.[0];
    if (current) {
      current.status = "completed";
      current.completedAt = Date.now();
    }
  });
  executor.createPlan = vi.fn(async function createPlanStub(this: Any) {
    this.plan = {
      description: "Plan",
      steps: [
        {
          id: "1",
          description: stepDescription,
          status: "pending",
        },
      ],
    };
  });

  return executor as TaskExecutor & {
    daemon: {
      logEvent: ReturnType<typeof vi.fn>;
      updateTaskStatus: ReturnType<typeof vi.fn>;
      updateTask: ReturnType<typeof vi.fn>;
      completeTask: ReturnType<typeof vi.fn>;
      getTaskEvents: ReturnType<typeof vi.fn>;
    };
  };
}

describe("TaskExecutor completion contract integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("short-circuits simple non-execute answer-first prompts without running plan execution", async () => {
    const executor = createExecuteHarness({
      title: "Ethics question",
      prompt:
        "Would you feel guilty if your efficiency caused job cuts in companies?\n\n[AGENT_STRATEGY_CONTEXT_V1]\nanswer_first=true\n[/AGENT_STRATEGY_CONTEXT_V1]",
      lastOutput: "",
      planStepDescription: "Draft a plan",
    });
    executor.task.agentConfig = {
      executionMode: "plan",
    };
    (executor as Any).emitAnswerFirstResponse = vi.fn(async function emitAnswerFirstStub(this: Any) {
      const text =
        "I don't feel guilt, but this is a serious ethical risk and should be handled responsibly.";
      this.lastAssistantOutput = text;
      this.lastNonVerificationOutput = text;
      this.lastAssistantText = text;
    });

    await (executor as Any).execute();

    expect((executor as Any).emitAnswerFirstResponse).toHaveBeenCalledTimes(1);
    expect(executor.createPlan).not.toHaveBeenCalled();
    expect(executor.executePlan).not.toHaveBeenCalled();
    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
  });

  it("short-circuits simple advice prompts even if stale executionMode is execute", async () => {
    const executor = createExecuteHarness({
      title: "Ethics question",
      prompt:
        "Would you feel guilty if your efficiency caused job cuts in companies?\n\n[AGENT_STRATEGY_CONTEXT_V1]\nanswer_first=true\n[/AGENT_STRATEGY_CONTEXT_V1]",
      lastOutput: "",
      planStepDescription: "Draft a plan",
    });
    executor.task.agentConfig = {
      executionMode: "execute",
      taskIntent: "advice",
    };
    (executor as Any).emitAnswerFirstResponse = vi.fn(async function emitAnswerFirstStub(this: Any) {
      const text = "I don't feel guilt, but job impacts should be handled responsibly.";
      this.lastAssistantOutput = text;
      this.lastNonVerificationOutput = text;
      this.lastAssistantText = text;
    });

    await (executor as Any).execute();

    expect((executor as Any).emitAnswerFirstResponse).toHaveBeenCalledTimes(1);
    expect(executor.createPlan).not.toHaveBeenCalled();
    expect(executor.executePlan).not.toHaveBeenCalled();
    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
  });

  it("does not complete the task when a direct answer is required but missing", async () => {
    const executor = createExecuteHarness({
      title: "Video decision",
      prompt:
        "Transcribe this video and let me know if I should spend my time watching it or skip it.",
      lastOutput: "Created: Dan_Koe_Video_Review.pdf",
      createdFiles: ["Dan_Koe_Video_Review.pdf"],
      planStepDescription: "Transcribe the video",
    });

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).not.toHaveBeenCalled();
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing direct answer"),
      }),
    );
  });

  it("does not complete the task when artifact evidence is required but missing", async () => {
    const executor = createExecuteHarness({
      title: "Generate report",
      prompt: "Create a PDF report from the attached data.",
      lastOutput: "Created: report.pdf",
      createdFiles: [],
      planStepDescription: "Generate the report",
    });

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).not.toHaveBeenCalled();
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing artifact evidence"),
      }),
    );
  });

  it("completes website tasks even when strategy context mentions docx artifacts", async () => {
    const executor = createExecuteHarness({
      title: "Windows 95 website",
      prompt: `Create a fully working website simulating the Windows 95 UI.

[AGENT_STRATEGY_CONTEXT_V1]
relationship_memory:
- Completed task: create a short word document where you write about ... Outcome: inner_world.docx
[/AGENT_STRATEGY_CONTEXT_V1]`,
      lastOutput: "Created files: index.html, styles/win95.css, scripts/desktop.js",
      createdFiles: ["index.html", "styles/win95.css", "scripts/desktop.js"],
      planStepDescription: "Implement website files",
    });

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing artifact evidence"),
      }),
    );
  });

  it("uses raw prompt for contract inference when runtime prompt metadata mentions docx", async () => {
    const executor = createExecuteHarness({
      title: "Windows 95 website",
      rawPrompt: "Create a fully working website simulating the Windows 95 UI.",
      prompt: `Create a fully working website simulating the Windows 95 UI.

ADDITIONAL CONTEXT:
DOCUMENT CREATION BEST PRACTICES:
1. ONLY use create_document (docx/pdf) when the user explicitly requests DOCX or PDF format.`,
      lastOutput: "Created files: index.html, styles/win95.css, scripts/desktop.js",
      createdFiles: ["index.html", "styles/win95.css", "scripts/desktop.js"],
      planStepDescription: "Implement website files",
    });

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing artifact evidence"),
      }),
    );
  });

  it("does not complete canvas build tasks when write_file and canvas_push evidence is missing", async () => {
    const executor = createExecuteHarness({
      title: "Competition demo",
      prompt: "Build something to win this competition and show it in canvas.",
      lastOutput: "Built and rendered an interactive prototype in canvas.",
      createdFiles: ["prototype.html"],
      planStepDescription: "Build an interactive app and show it in canvas",
    });
    (executor as Any).successfulToolUsageCounts = new Map();

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).not.toHaveBeenCalled();
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing required tool evidence"),
      }),
    );
  });

  it("completes canvas build tasks when write_file and canvas_push evidence is present", async () => {
    const executor = createExecuteHarness({
      title: "Competition demo",
      prompt: "Build something to win this competition and show it in canvas.",
      lastOutput: "Built and rendered an interactive prototype in canvas.",
      createdFiles: ["prototype.html"],
      planStepDescription: "Build an interactive app and show it in canvas",
    });
    (executor as Any).successfulToolUsageCounts = new Map([
      ["write_file", 1],
      ["canvas_push", 1],
    ]);

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing required tool evidence"),
      }),
    );
  });

  it("does not complete the task when verification evidence is required but missing", async () => {
    const executor = createExecuteHarness({
      title: "Video decision",
      prompt:
        "Transcribe this video and then let me know if I should spend my time watching it or skip it.",
      lastOutput: "You should skip it because it repeats beginner concepts.",
      planStepDescription: "Transcribe the video",
    });

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).not.toHaveBeenCalled();
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing verification evidence"),
      }),
    );
  });

  it("accepts reasoned recommendations when evidence tools were used", async () => {
    const executor = createExecuteHarness({
      title: "Video decision",
      prompt:
        "Transcribe this video and then let me know if I should spend my time watching it or skip it.",
      lastOutput: "You should skip it because it repeats beginner concepts.",
      planStepDescription: "Transcribe the video",
    });
    (executor as Any).toolResultMemory = [
      { tool: "web_fetch", summary: "https://example.com/transcript", timestamp: Date.now() },
    ];

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing verification evidence"),
      }),
    );
  });

  it("does not complete high-risk research summaries without dated fetched evidence", async () => {
    const executor = createExecuteHarness({
      title: "Daily AI Agent Trends Research",
      prompt:
        "Research the latest AI agent trends from the last day and summarize key launches and funding updates.",
      lastOutput:
        "Major releases include Gemini 2.0 and Copilot Marketplace. Funding surged to $2.5B this quarter.",
      planStepDescription: "Summarize latest AI agent releases and funding trends",
    });

    (executor as Any).toolResultMemory = [
      {
        tool: "web_search",
        summary: "query \"AI agent trends\" returned sources",
        timestamp: Date.now(),
      },
    ];
    (executor as Any).webEvidenceMemory = [
      {
        tool: "web_fetch",
        url: "https://example.com/ai-news",
        timestamp: Date.now(),
      },
    ];

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).not.toHaveBeenCalled();
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing source validation"),
      }),
    );
  });

  it("allows high-risk research summaries when fetched sources include publish dates", async () => {
    const executor = createExecuteHarness({
      title: "Daily AI Agent Trends Research",
      prompt:
        "Research the latest AI agent trends from the last day and summarize key launches and funding updates.",
      lastOutput:
        "Major releases include Gemini 2.0 and Copilot Marketplace. Funding surged to $2.5B this quarter.",
      planStepDescription: "Summarize latest AI agent releases and funding trends",
    });

    (executor as Any).webEvidenceMemory = [
      {
        tool: "web_fetch",
        url: "https://example.com/ai-news",
        publishDate: "2026-02-26",
        timestamp: Date.now(),
      },
    ];

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing source validation"),
      }),
    );
  });

  it("downgrades source-validation guard failures to partial success for cron best-effort runs", async () => {
    const executor = createExecuteHarness({
      title: "Daily AI Agent Trends Research",
      prompt:
        "Research the latest AI agent trends from the last day and summarize key launches and funding updates.\n\n[AGENT_STRATEGY_CONTEXT_V1]\ntimeout_finalize_bias=true\n[/AGENT_STRATEGY_CONTEXT_V1]",
      lastOutput:
        "Major releases include Gemini 2.0 and Copilot Marketplace. Funding surged to $2.5B this quarter.",
      planStepDescription: "Summarize latest AI agent releases and funding trends",
      source: "cron",
    });

    (executor as Any).toolResultMemory = [
      {
        tool: "web_search",
        summary: "query \"AI agent trends\" returned sources",
        timestamp: Date.now(),
      },
    ];
    (executor as Any).webEvidenceMemory = [
      {
        tool: "web_fetch",
        url: "https://example.com/ai-news",
        timestamp: Date.now(),
      },
    ];

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.completeTask).toHaveBeenCalledWith(
      "task-1",
      expect.stringContaining("could not be fully validated"),
      expect.objectContaining({
        terminalStatus: "partial_success",
        failureClass: "contract_error",
      }),
    );
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
      }),
    );
  });

  it("does not downgrade source-validation failures when no fetched source evidence exists", async () => {
    const executor = createExecuteHarness({
      title: "Daily AI Agent Trends Research",
      prompt:
        "Research the latest AI agent trends from the last day and summarize key launches and funding updates.\n\n[AGENT_STRATEGY_CONTEXT_V1]\ntimeout_finalize_bias=true\n[/AGENT_STRATEGY_CONTEXT_V1]",
      lastOutput:
        "Major releases include Gemini 2.0 and Copilot Marketplace. Funding surged to $2.5B this quarter.",
      planStepDescription: "Summarize latest AI agent releases and funding trends",
      source: "cron",
    });

    (executor as Any).toolResultMemory = [
      {
        tool: "web_search",
        summary: "query \"AI agent trends\" returned sources",
        timestamp: Date.now(),
      },
    ];
    (executor as Any).webEvidenceMemory = [];

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).not.toHaveBeenCalled();
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing source validation"),
      }),
    );
  });

  it("extracts dated evidence from relative publish-time phrases", () => {
    const executor = createExecuteHarness({
      title: "Daily AI Agent Trends Research",
      prompt: "Research the latest AI agent trends and summarize key launches.",
      lastOutput: "Summary",
      planStepDescription: "Fetch and summarize sources",
    });

    (executor as Any).recordWebEvidence("web_fetch", {
      url: "https://example.com/ai-news",
      title: "AI launch updates",
      content: "Published 3 hours ago",
    });

    const evidence = (executor as Any).webEvidenceMemory || [];
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence[0].publishDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((executor as Any).hasDatedFetchedWebEvidence(1)).toBe(true);
  });

  it("ignores generic relative time phrases without publication context cues", () => {
    const executor = createExecuteHarness({
      title: "Daily AI Agent Trends Research",
      prompt: "Research the latest AI agent trends and summarize key launches.",
      lastOutput: "Summary",
      planStepDescription: "Fetch and summarize sources",
    });

    (executor as Any).recordWebEvidence("web_fetch", {
      url: "https://example.com/ai-news",
      title: "AI launch updates",
      content: "Top discussion: 3 hours ago in comments.",
    });

    expect((executor as Any).hasDatedFetchedWebEvidence(1)).toBe(false);
  });

  it("applies source-validation fallback during interruption-resume finalization", async () => {
    const executor = createExecuteHarness({
      title: "Daily AI Agent Trends Research",
      prompt:
        "Research the latest AI agent trends from the last day and summarize key launches and funding updates.\n\n[AGENT_STRATEGY_CONTEXT_V1]\ntimeout_finalize_bias=true\n[/AGENT_STRATEGY_CONTEXT_V1]",
      lastOutput:
        "Major releases include Gemini 2.0 and Copilot Marketplace. Funding surged to $2.5B this quarter.",
      planStepDescription: "Summarize latest AI agent releases and funding trends",
      source: "cron",
    });
    executor.plan = {
      description: "Plan",
      steps: [{ id: "1", description: "Done", status: "completed" }],
    };
    (executor as Any).webEvidenceMemory = [
      {
        tool: "web_fetch",
        url: "https://example.com/ai-news",
        timestamp: Date.now(),
      },
    ];

    await (executor as Any).resumeAfterInterruptionUnlocked();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.completeTask).toHaveBeenCalledWith(
      "task-1",
      expect.stringContaining("could not be fully validated"),
      expect.objectContaining({
        terminalStatus: "partial_success",
        failureClass: "contract_error",
      }),
    );
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("applies source-validation fallback during manual continuation finalization", async () => {
    const executor = createExecuteHarness({
      title: "Daily AI Agent Trends Research",
      prompt:
        "Research the latest AI agent trends from the last day and summarize key launches and funding updates.\n\n[AGENT_STRATEGY_CONTEXT_V1]\ntimeout_finalize_bias=true\n[/AGENT_STRATEGY_CONTEXT_V1]",
      lastOutput:
        "Major releases include Gemini 2.0 and Copilot Marketplace. Funding surged to $2.5B this quarter.",
      planStepDescription: "Summarize latest AI agent releases and funding trends",
      source: "cron",
    });

    executor.continuationCount = 0;
    executor.continuationWindow = 1;
    executor.continuationStrategy = "adaptive_progress";
    executor.maxAutoContinuations = 3;
    executor.minProgressScoreForAutoContinue = 0.25;
    executor.maxLifetimeTurns = 320;
    executor.lifetimeTurnCount = 10;
    executor.globalTurnCount = 60;
    executor.iterationCount = 2;
    executor.totalInputTokens = 0;
    executor.totalOutputTokens = 0;
    executor.totalCost = 0;
    executor.usageOffsetInputTokens = 0;
    executor.usageOffsetOutputTokens = 0;
    executor.usageOffsetCost = 0;
    executor.windowStartEventCount = 0;
    executor.noProgressStreak = 0;
    executor.pendingLoopStrategySwitchMessage = "";
    executor.appendConversationHistory = vi.fn();
    executor.executePlan = vi.fn(async () => undefined);
    executor.maybeCompactBeforeContinuation = vi.fn(async () => undefined);
    executor.assessContinuationWindow = vi.fn(() => ({
      progressScore: 0.6,
      loopRiskIndex: 0.2,
      repeatedFingerprintCount: 0,
      dominantFingerprint: "tool::input::ok",
      windowSummary: {
        stepCompleted: 1,
        writeMutations: 0,
        resolvedErrorRecoveries: 0,
        repeatedErrorPenalty: 0,
        emptyNoOpTurns: 0,
      },
    }));
    executor.plan = {
      description: "Plan",
      steps: [{ id: "1", description: "Done", status: "completed" }],
    };
    (executor as Any).webEvidenceMemory = [
      {
        tool: "web_fetch",
        url: "https://example.com/ai-news",
        timestamp: Date.now(),
      },
    ];

    await (executor as Any).continueAfterBudgetExhaustedUnlocked({ mode: "manual" });

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.completeTask).toHaveBeenCalledWith(
      "task-1",
      expect.stringContaining("could not be fully validated"),
      expect.objectContaining({
        terminalStatus: "partial_success",
        failureClass: "contract_error",
      }),
    );
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("downgrades output-backed mutation checkpoint failures to partial success for manual tasks", async () => {
    const executor = createExecuteHarness({
      title: "Build dashboard",
      prompt: "Implement the dashboard, save the deliverables, and summarize the current state.",
      lastOutput:
        "Created the dashboard implementation and supporting notes. One mutation-required step still reported an artifact checkpoint failure, so the remaining blocker is limited to that unfinished write path rather than the rest of the completed deliverables.",
      createdFiles: ["src/dashboard.tsx", "docs/dashboard-notes.md"],
      planStepDescription: "Implement dashboard deliverables",
      source: "manual",
    });

    executor.executePlan = vi.fn(async function executePlanStub(this: Any) {
      this.plan = {
        description: "Plan",
        steps: [
          {
            id: "1",
            description: "Create dashboard deliverables",
            status: "completed",
          },
          {
            id: "2",
            description: "Write the remaining validation artifact",
            status: "failed",
            error:
              "Step contract failure [contract_unmet_write_required][artifact_write_checkpoint_failed]: iteration 7 reached without successful file/canvas mutation.",
          },
        ],
      };
      throw new Error("Task failed: mutation-required contract unmet - Write the remaining validation artifact");
    });

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledWith(
      "task-1",
      expect.any(String),
      expect.objectContaining({
        terminalStatus: "partial_success",
        failureClass: "contract_unmet_write_required",
        outputSummary: expect.objectContaining({
          outputCount: 2,
        }),
      }),
    );
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("completes only when the completion contract requirements are satisfied", async () => {
    const executor = createExecuteHarness({
      title: "Video review",
      prompt:
        "Create a PDF review document for this video and let me know whether I should watch it.",
      lastOutput:
        "Based on my review, recommendation: You should skip this unless you need beginner-level context.",
      createdFiles: ["video_review.pdf"],
      planStepDescription: "Verify: review transcript and provide recommendation",
    });

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("allows watch/skip recommendation tasks without creating an artifact when no file is generated", async () => {
    const executor = createExecuteHarness({
      title: "Video review",
      prompt:
        "Transcribe this YouTube video and create a document for me to review, then tell me if I should watch it.",
      lastOutput:
        "You should watch this only if you specifically need practical examples of creator-income positioning.",
      createdFiles: [],
      planStepDescription: "Review transcript and recommend",
    });

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("routes provider request-cancelled errors through timeout recovery instead of failing", async () => {
    const executor = createExecuteHarness({
      title: "Draft whitepaper",
      prompt: "Create a detailed whitepaper draft.",
      lastOutput: "Initial summary",
      planStepDescription: "Write the draft",
    });
    const recoverySpy = vi.fn(async () => true);

    (executor as Any).executePlan = vi.fn(async () => {
      throw new Error("Request cancelled");
    });
    (executor as Any).finalizeWithTimeoutRecovery = recoverySpy;

    await (executor as Any).execute();

    expect(recoverySpy).toHaveBeenCalledTimes(1);
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ status: "failed" }),
    );
  });
});
