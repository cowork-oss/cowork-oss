import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";
import type {
  ImprovementCampaign,
  ImprovementCandidate,
  ImprovementJudgeVerdict,
  ImprovementVariantRun,
  Task,
  Workspace,
} from "../../../shared/types";
import { ImprovementLoopService } from "../ImprovementLoopService";

const workspaces = new Map<string, Workspace>();
const tasks = new Map<string, Task>();
const candidates = new Map<string, ImprovementCandidate>();
const campaigns = new Map<string, ImprovementCampaign>();
const variants = new Map<string, ImprovementVariantRun>();
const verdicts = new Map<string, ImprovementJudgeVerdict>();

let mockSettings = {
  enabled: true,
  autoRun: false,
  includeDevLogs: false,
  intervalMinutes: 1440,
  variantsPerCampaign: 4,
  maxConcurrentCampaigns: 1,
  maxOpenCandidatesPerWorkspace: 25,
  requireWorktree: true,
  reviewRequired: true,
  judgeRequired: true,
  promotionMode: "github_pr" as const,
  evalWindowDays: 14,
  replaySetSize: 2,
};

vi.mock("../ImprovementSettingsManager", () => ({
  ImprovementSettingsManager: {
    loadSettings: () => mockSettings,
    saveSettings: vi.fn(),
  },
}));

vi.mock("../../database/repositories", () => ({
  WorkspaceRepository: class {
    findAll() {
      return [...workspaces.values()];
    }
    findById(id: string) {
      return workspaces.get(id);
    }
  },
  TaskRepository: class {
    create(input: Any) {
      const task: Task = {
        id: `task-root-${tasks.size + 1}`,
        title: input.title,
        prompt: input.prompt,
        rawPrompt: input.rawPrompt,
        status: input.status,
        workspaceId: input.workspaceId,
        agentConfig: input.agentConfig,
        source: input.source,
        parentTaskId: input.parentTaskId,
        agentType: input.agentType,
        depth: input.depth,
        resultSummary: input.resultSummary,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      tasks.set(task.id, task);
      return task;
    }
    update(id: string, updates: Partial<Task>) {
      const current = tasks.get(id);
      if (!current) return;
      tasks.set(id, { ...current, ...updates, updatedAt: Date.now() });
    }
    findById(id: string) {
      return tasks.get(id);
    }
  },
}));

vi.mock("../ImprovementRepositories", () => ({
  ImprovementCandidateRepository: class {
    list(params?: { workspaceId?: string }) {
      let rows = [...candidates.values()];
      if (params?.workspaceId) rows = rows.filter((item) => item.workspaceId === params.workspaceId);
      return rows;
    }
    findById(id: string) {
      return candidates.get(id);
    }
    findByFingerprint() {
      return undefined;
    }
  },
  ImprovementCampaignRepository: class {
    create(input: Any) {
      const campaign: ImprovementCampaign = {
        ...input,
        id: `campaign-${campaigns.size + 1}`,
        createdAt: input.createdAt ?? Date.now(),
        variants: [],
      };
      campaigns.set(campaign.id, campaign);
      return campaign;
    }
    update(id: string, updates: Partial<ImprovementCampaign>) {
      const current = campaigns.get(id);
      if (!current) return;
      campaigns.set(id, { ...current, ...updates });
    }
    findById(id: string) {
      return campaigns.get(id);
    }
    list(params?: { workspaceId?: string; status?: string[] | string }) {
      let rows = [...campaigns.values()];
      if (params?.workspaceId) rows = rows.filter((item) => item.workspaceId === params.workspaceId);
      if (params?.status) {
        const statuses = Array.isArray(params.status) ? params.status : [params.status];
        rows = rows.filter((item) => statuses.includes(item.status));
      }
      return rows;
    }
    countActive() {
      return [...campaigns.values()].filter((item) => ["planning", "running_variants", "judging"].includes(item.status)).length;
    }
  },
  ImprovementVariantRunRepository: class {
    create(input: Any) {
      const variant: ImprovementVariantRun = {
        ...input,
        id: `variant-${variants.size + 1}`,
        createdAt: input.createdAt ?? Date.now(),
      };
      variants.set(variant.id, variant);
      return variant;
    }
    update(id: string, updates: Partial<ImprovementVariantRun>) {
      const current = variants.get(id);
      if (!current) return;
      variants.set(id, { ...current, ...updates });
    }
    findById(id: string) {
      return variants.get(id);
    }
    findByTaskId(taskId: string) {
      return [...variants.values()].find((item) => item.taskId === taskId);
    }
    listByCampaignId(campaignId: string) {
      return [...variants.values()].filter((item) => item.campaignId === campaignId);
    }
    list(params?: { campaignId?: string; status?: string[] | string }) {
      let rows = [...variants.values()];
      if (params?.campaignId) rows = rows.filter((item) => item.campaignId === params.campaignId);
      if (params?.status) {
        const statuses = Array.isArray(params.status) ? params.status : [params.status];
        rows = rows.filter((item) => statuses.includes(item.status));
      }
      return rows;
    }
  },
  ImprovementJudgeVerdictRepository: class {
    upsert(input: ImprovementJudgeVerdict) {
      verdicts.set(input.campaignId, input);
      return input;
    }
    findByCampaignId(campaignId: string) {
      return verdicts.get(campaignId);
    }
  },
}));

vi.mock("../ExperimentEvaluationService", () => ({
  ExperimentEvaluationService: class {
    snapshot(windowDays: number) {
      return {
        generatedAt: Date.now(),
        windowDays,
        taskSuccessRate: 0.5,
        approvalDeadEndRate: 0.1,
        verificationPassRate: 0.6,
        retriesPerTask: 1,
        toolFailureRateByTool: [],
      };
    }
    evaluateVariant(params: Any) {
      return {
        variantId: params.variant.id,
        lane: params.variant.lane,
        score: params.variant.lane === "root_cause" ? 0.91 : 0.72,
        targetedVerificationPassed: params.variant.lane !== "guardrail_hardening",
        verificationPassed: true,
        regressionSignals: params.variant.lane === "guardrail_hardening" ? ["Verification failed event recorded."] : [],
        failureClassResolved: true,
        replayPassRate: params.variant.lane === "root_cause" ? 1 : 0.5,
        diffSizePenalty: 0.02,
        summary: `Variant ${params.variant.lane} evaluated.`,
        notes: [`Variant ${params.variant.lane} notes.`],
      };
    }
    evaluateCampaign(params: Any) {
      const winner = params.variants.find((variant: ImprovementVariantRun) => variant.lane === "root_cause");
      const verdict: ImprovementJudgeVerdict = {
        id: `judge-${params.campaign.id}`,
        campaignId: params.campaign.id,
        winnerVariantId: winner?.id,
        status: winner ? "passed" : "failed",
        summary: winner ? "Selected root_cause as the campaign winner." : "No winner.",
        notes: ["Judge completed."],
        comparedAt: Date.now(),
        variantRankings: params.variants.map((variant: ImprovementVariantRun, index: number) => ({
          variantId: variant.id,
          lane: variant.lane,
          score: 0.9 - index * 0.1,
        })),
        replayCases: params.campaign.replayCases,
      };
      return {
        verdict,
        outcomeMetrics: this.snapshot(params.evalWindowDays),
        winner: winner
          ? {
              variantId: winner.id,
              lane: winner.lane,
              score: 0.91,
              targetedVerificationPassed: true,
              verificationPassed: true,
              regressionSignals: [],
              failureClassResolved: true,
              replayPassRate: 1,
              diffSizePenalty: 0.02,
              summary: "winner",
              notes: [],
            }
          : undefined,
        evaluations: [],
      };
    }
  },
}));

describe("ImprovementLoopService", () => {
  beforeEach(() => {
    workspaces.clear();
    tasks.clear();
    candidates.clear();
    campaigns.clear();
    variants.clear();
    verdicts.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function makeCandidate(): ImprovementCandidate {
    return {
      id: "candidate-1",
      workspaceId: "workspace-1",
      fingerprint: "candidate-fingerprint",
      source: "verification_failure",
      status: "open",
      title: "Fix verifier-detected regressions",
      summary: "Verifier fails because completion artifacts are missing.",
      severity: 0.95,
      recurrenceCount: 4,
      fixabilityScore: 0.9,
      priorityScore: 0.92,
      evidence: [
        {
          type: "verification_failure",
          taskId: "task-old-1",
          summary: "Verifier still fails after task completion.",
          createdAt: Date.now() - 1000,
        },
        {
          type: "task_failure",
          taskId: "task-old-2",
          summary: "Completion blocked by contract error.",
          createdAt: Date.now() - 500,
        },
        {
          type: "dev_log",
          summary: "Error: artifact missing.",
          createdAt: Date.now(),
        },
      ],
      firstSeenAt: Date.now() - 2000,
      lastSeenAt: Date.now(),
    };
  }

  function makeWorkspace(): Workspace {
    return {
      id: "workspace-1",
      name: "Workspace",
      path: "/tmp/workspace-1",
      createdAt: Date.now(),
      permissions: {
        read: true,
        write: true,
        delete: false,
        network: true,
        shell: true,
      },
    };
  }

  it("creates one campaign with four distinct variants and a judge verdict", async () => {
    const workspace = makeWorkspace();
    const candidate = makeCandidate();
    workspaces.set(workspace.id, workspace);
    candidates.set(candidate.id, candidate);

    const candidateService = {
      refresh: vi.fn().mockResolvedValue({ candidateCount: 1 }),
      dismissCandidate: vi.fn(),
      markCandidateRunning: vi.fn(),
      markCandidateReview: vi.fn(),
      markCandidateResolved: vi.fn(),
      reopenCandidate: vi.fn(),
      getTopCandidateForWorkspace: vi.fn().mockReturnValue(candidate),
    } as Any;

    const daemon = new EventEmitter() as Any;
    daemon.createChildTask = vi.fn().mockImplementation(async (params: Any) => {
      const taskId = `task-${tasks.size + 1}`;
      const task: Task = {
        id: taskId,
        title: params.title,
        prompt: params.prompt,
        status: "executing",
        workspaceId: params.workspaceId,
        agentConfig: params.agentConfig,
        source: params.source,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      tasks.set(task.id, task);
      return task;
    });
    daemon.getWorktreeManager = vi.fn(() => ({
      shouldUseWorktree: vi.fn().mockResolvedValue(true),
      openPullRequest: vi.fn(),
      mergeToBase: vi.fn(),
    }));

    const service = new ImprovementLoopService({} as Any, candidateService);
    await service.start(daemon);
    const campaign = await service.runNextExperiment();

    expect(campaign).toBeTruthy();
    expect(campaign?.variants).toHaveLength(4);
    expect(new Set(campaign?.variants.map((variant) => variant.lane))).toEqual(
      new Set(["minimal_patch", "test_first", "root_cause", "guardrail_hardening"]),
    );

    for (const variant of campaign!.variants) {
      const task = tasks.get(variant.taskId!);
      tasks.set(variant.taskId!, {
        ...task!,
        status: "completed",
        completedAt: Date.now(),
        terminalStatus: "ok",
        worktreePath: `/tmp/${variant.id}`,
        worktreeBranch: `codex/${variant.id}`,
        resultSummary: `Completed ${variant.lane}`,
      });
      daemon.emit("worktree_created", { taskId: variant.taskId, branch: `codex/${variant.id}` });
      daemon.emit("task_completed", { taskId: variant.taskId });
    }

    await vi.waitFor(() => {
      const updated = campaigns.get(campaign!.id);
      expect(updated?.status).toBe("ready_for_review");
      expect(updated?.winnerVariantId).toBeTruthy();
      expect(verdicts.get(campaign!.id)?.status).toBe("passed");
    });

    const latest = await service.listCampaignsFresh(workspace.id);
    expect(latest[0]?.judgeVerdict?.winnerVariantId).toBe(campaigns.get(campaign!.id)?.winnerVariantId);
  });

  it("promotes only the judge-selected winner variant", async () => {
    const workspace = makeWorkspace();
    const candidate = makeCandidate();
    workspaces.set(workspace.id, workspace);
    candidates.set(candidate.id, candidate);

    const candidateService = {
      refresh: vi.fn().mockResolvedValue({ candidateCount: 1 }),
      dismissCandidate: vi.fn(),
      markCandidateRunning: vi.fn(),
      markCandidateReview: vi.fn(),
      markCandidateResolved: vi.fn(),
      reopenCandidate: vi.fn(),
      getTopCandidateForWorkspace: vi.fn().mockReturnValue(candidate),
    } as Any;

    const openPullRequest = vi.fn().mockResolvedValue({ success: true, number: 42, url: "https://example.test/pr/42" });
    const daemon = new EventEmitter() as Any;
    daemon.createChildTask = vi.fn().mockImplementation(async (params: Any) => {
      const taskId = `task-${tasks.size + 1}`;
      const task: Task = {
        id: taskId,
        title: params.title,
        prompt: params.prompt,
        status: "executing",
        workspaceId: params.workspaceId,
        agentConfig: params.agentConfig,
        source: params.source,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      tasks.set(task.id, task);
      return task;
    });
    daemon.getWorktreeManager = vi.fn(() => ({
      shouldUseWorktree: vi.fn().mockResolvedValue(true),
      openPullRequest,
      mergeToBase: vi.fn(),
    }));

    const service = new ImprovementLoopService({} as Any, candidateService);
    await service.start(daemon);
    const campaign = await service.runNextExperiment();

    for (const variant of campaign!.variants) {
      tasks.set(variant.taskId!, {
        ...(tasks.get(variant.taskId!) as Task),
        status: "completed",
        completedAt: Date.now(),
        terminalStatus: "ok",
        worktreePath: `/tmp/${variant.id}`,
        worktreeBranch: `codex/${variant.id}`,
        resultSummary: `Completed ${variant.lane}`,
      });
      daemon.emit("worktree_created", { taskId: variant.taskId, branch: `codex/${variant.id}` });
      daemon.emit("task_completed", { taskId: variant.taskId });
    }

    await vi.waitFor(() => {
      expect(campaigns.get(campaign!.id)?.status).toBe("ready_for_review");
    });

    const reviewed = await service.reviewCampaign(campaign!.id, "accepted");
    expect(reviewed?.promotionStatus).toBe("pr_opened");
    const winner = variants.get(reviewed!.winnerVariantId!);
    expect(openPullRequest).toHaveBeenCalledWith(
      winner?.taskId,
      expect.objectContaining({
        title: expect.stringContaining(candidate.title),
      }),
    );
    expect(candidateService.markCandidateResolved).toHaveBeenCalledWith(candidate.id);
  });

  it("reopens the candidate when the judge cannot find a valid winner", async () => {
    const workspace = makeWorkspace();
    const candidate = makeCandidate();
    workspaces.set(workspace.id, workspace);
    candidates.set(candidate.id, candidate);

    const candidateService = {
      refresh: vi.fn().mockResolvedValue({ candidateCount: 1 }),
      dismissCandidate: vi.fn(),
      markCandidateRunning: vi.fn(),
      markCandidateReview: vi.fn(),
      markCandidateResolved: vi.fn(),
      reopenCandidate: vi.fn(),
      getTopCandidateForWorkspace: vi.fn().mockReturnValue(candidate),
    } as Any;

    const daemon = new EventEmitter() as Any;
    daemon.createChildTask = vi.fn().mockImplementation(async (params: Any) => {
      const taskId = `task-${tasks.size + 1}`;
      const task: Task = {
        id: taskId,
        title: params.title,
        prompt: params.prompt,
        status: "executing",
        workspaceId: params.workspaceId,
        agentConfig: params.agentConfig,
        source: params.source,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      tasks.set(task.id, task);
      return task;
    });
    daemon.getWorktreeManager = vi.fn(() => ({
      shouldUseWorktree: vi.fn().mockResolvedValue(true),
      openPullRequest: vi.fn(),
      mergeToBase: vi.fn(),
    }));

    const service = new ImprovementLoopService({} as Any, candidateService);
    await service.start(daemon);
    const campaign = await service.runNextExperiment();

    (service as Any).evaluationService.evaluateCampaign = vi.fn(() => ({
      verdict: {
        id: `judge-${campaign!.id}`,
        campaignId: campaign!.id,
        status: "failed",
        summary: "No winner.",
        notes: [],
        comparedAt: Date.now(),
        variantRankings: [],
        replayCases: [],
      },
      outcomeMetrics: {
        generatedAt: Date.now(),
        windowDays: 14,
        taskSuccessRate: 0.5,
        approvalDeadEndRate: 0.1,
        verificationPassRate: 0.6,
        retriesPerTask: 1,
        toolFailureRateByTool: [],
      },
      winner: undefined,
      evaluations: [],
    }));

    for (const variant of campaign!.variants) {
      tasks.set(variant.taskId!, {
        ...(tasks.get(variant.taskId!) as Task),
        status: "completed",
        completedAt: Date.now(),
        terminalStatus: "failed",
        resultSummary: `Failed ${variant.lane}`,
      });
      daemon.emit("task_completed", { taskId: variant.taskId });
    }

    await vi.waitFor(() => {
      expect(campaigns.get(campaign!.id)?.status).toBe("failed");
      expect(candidateService.reopenCandidate).toHaveBeenCalledWith(candidate.id);
    });
  });
});
