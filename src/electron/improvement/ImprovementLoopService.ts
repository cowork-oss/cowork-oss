import type Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import type { AgentDaemon } from "../agent/daemon";
import { TaskRepository, WorkspaceRepository } from "../database/repositories";
import type {
  ImprovementCampaign,
  ImprovementCandidate,
  ImprovementLoopSettings,
  ImprovementReviewStatus,
  ImprovementVariantLane,
  ImprovementVariantRun,
  NotificationType,
  Task,
  Workspace,
} from "../../shared/types";
import {
  buildImprovementJudgeSummaryPrompt,
  buildImprovementVariantPrompt,
  loadImprovementProgram,
} from "./ExperimentPromptBuilder";
import { ImprovementCandidateService } from "./ImprovementCandidateService";
import { ExperimentEvaluationService } from "./ExperimentEvaluationService";
import {
  ImprovementCampaignRepository,
  ImprovementCandidateRepository,
  ImprovementJudgeVerdictRepository,
  ImprovementVariantRunRepository,
} from "./ImprovementRepositories";
import { ImprovementSettingsManager } from "./ImprovementSettingsManager";

interface ImprovementLoopServiceDeps {
  notify?: (params: {
    type: NotificationType;
    title: string;
    message: string;
    taskId?: string;
    workspaceId?: string;
  }) => Promise<void> | void;
}

const DEFAULT_LANES: ImprovementVariantLane[] = [
  "minimal_patch",
  "test_first",
  "root_cause",
  "guardrail_hardening",
];

export class ImprovementLoopService {
  private readonly workspaceRepo: WorkspaceRepository;
  private readonly taskRepo: TaskRepository;
  private readonly candidateRepo: ImprovementCandidateRepository;
  private readonly campaignRepo: ImprovementCampaignRepository;
  private readonly variantRepo: ImprovementVariantRunRepository;
  private readonly judgeVerdictRepo: ImprovementJudgeVerdictRepository;
  private readonly evaluationService: ExperimentEvaluationService;
  private agentDaemon: AgentDaemon | null = null;
  private intervalHandle?: ReturnType<typeof setInterval>;
  private worktreeCreatedListener?: (evt: Any) => void;
  private taskCompletedListener?: (evt: Any) => void;
  private taskStatusListener?: (evt: Any) => void;
  private readonly finalizingCampaignIds = new Set<string>();
  private started = false;

  constructor(
    private readonly db: Database.Database,
    private readonly candidateService: ImprovementCandidateService,
    private readonly deps: ImprovementLoopServiceDeps = {},
  ) {
    this.workspaceRepo = new WorkspaceRepository(db);
    this.taskRepo = new TaskRepository(db);
    this.candidateRepo = new ImprovementCandidateRepository(db);
    this.campaignRepo = new ImprovementCampaignRepository(db);
    this.variantRepo = new ImprovementVariantRunRepository(db);
    this.judgeVerdictRepo = new ImprovementJudgeVerdictRepository(db);
    this.evaluationService = new ExperimentEvaluationService(db);
  }

  async start(agentDaemon: AgentDaemon): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.agentDaemon = agentDaemon;

    this.worktreeCreatedListener = (evt: Any) => {
      const taskId = typeof evt?.taskId === "string" ? evt.taskId : "";
      if (!taskId) return;
      const variant = this.variantRepo.findByTaskId(taskId);
      if (!variant) return;
      const branch =
        typeof evt?.payload?.branch === "string"
          ? evt.payload.branch
          : typeof evt?.branch === "string"
            ? evt.branch
            : "";
      if (branch) {
        this.variantRepo.update(variant.id, { branchName: branch });
      }
    };
    agentDaemon.on("worktree_created", this.worktreeCreatedListener);

    const finalize = (taskId: string) => {
      const variant = this.variantRepo.findByTaskId(taskId);
      if (!variant || (variant.status !== "queued" && variant.status !== "running")) return;
      void this.finalizeVariant(variant.id, taskId);
    };

    this.taskCompletedListener = (evt: Any) => {
      const taskId = typeof evt?.taskId === "string" ? evt.taskId : "";
      if (taskId) finalize(taskId);
    };
    agentDaemon.on("task_completed", this.taskCompletedListener);

    this.taskStatusListener = (evt: Any) => {
      const taskId = typeof evt?.taskId === "string" ? evt.taskId : "";
      if (taskId) finalize(taskId);
    };
    agentDaemon.on("task_status", this.taskStatusListener);

    await this.refreshCandidates();
    await this.reconcileActiveCampaigns();
    this.resetInterval();
    const settings = this.getSettings();
    if (settings.enabled && settings.autoRun) {
      await this.runNextExperiment();
    }
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
    if (this.agentDaemon && this.worktreeCreatedListener) {
      this.agentDaemon.removeListener("worktree_created", this.worktreeCreatedListener);
    }
    if (this.agentDaemon && this.taskCompletedListener) {
      this.agentDaemon.removeListener("task_completed", this.taskCompletedListener);
    }
    if (this.agentDaemon && this.taskStatusListener) {
      this.agentDaemon.removeListener("task_status", this.taskStatusListener);
    }
    this.worktreeCreatedListener = undefined;
    this.taskCompletedListener = undefined;
    this.taskStatusListener = undefined;
    this.agentDaemon = null;
    this.started = false;
  }

  getSettings(): ImprovementLoopSettings {
    return ImprovementSettingsManager.loadSettings();
  }

  saveSettings(settings: ImprovementLoopSettings): ImprovementLoopSettings {
    ImprovementSettingsManager.saveSettings(settings);
    const next = ImprovementSettingsManager.loadSettings();
    this.resetInterval();
    return next;
  }

  listCandidates(workspaceId?: string): ImprovementCandidate[] {
    return this.candidateRepo.list({ workspaceId });
  }

  listCampaigns(workspaceId?: string): ImprovementCampaign[] {
    return this.enrichCampaigns(this.campaignRepo.list({ workspaceId }));
  }

  async listCampaignsFresh(workspaceId?: string): Promise<ImprovementCampaign[]> {
    await this.reconcileActiveCampaigns();
    return this.listCampaigns(workspaceId);
  }

  async refreshCandidates(): Promise<{ candidateCount: number }> {
    return this.candidateService.refresh();
  }

  dismissCandidate(candidateId: string): ImprovementCandidate | undefined {
    return this.candidateService.dismissCandidate(candidateId);
  }

  async reviewCampaign(
    campaignId: string,
    reviewStatus: ImprovementReviewStatus,
  ): Promise<ImprovementCampaign | undefined> {
    const campaign = this.campaignRepo.findById(campaignId);
    if (!campaign) return undefined;

    if (reviewStatus === "dismissed") {
      this.campaignRepo.update(campaignId, {
        reviewStatus,
        status: "failed",
        promotionStatus:
          campaign.promotionStatus === "merged" || campaign.promotionStatus === "pr_opened"
            ? campaign.promotionStatus
            : "idle",
        promotionError: undefined,
        completedAt: campaign.completedAt || Date.now(),
      });
      this.candidateService.reopenCandidate(campaign.candidateId);
      void this.notify({
        type: "info",
        title: "Improvement campaign dismissed",
        message: campaign.verdictSummary || "A self-improvement campaign was dismissed from review.",
        workspaceId: campaign.workspaceId,
      });
      return this.getCampaign(campaignId);
    }

    if (campaign.status !== "ready_for_review" && campaign.status !== "promoted") {
      this.campaignRepo.update(campaignId, {
        promotionStatus: "promotion_failed",
        promotionError: "Only reviewed campaigns with a winner can be promoted.",
      });
      return this.getCampaign(campaignId);
    }

    const winner = campaign.winnerVariantId ? this.variantRepo.findById(campaign.winnerVariantId) : undefined;
    if (!winner?.taskId) {
      this.campaignRepo.update(campaignId, {
        promotionStatus: "promotion_failed",
        promotionError: "No promotable winner variant is linked to this campaign.",
      });
      return this.getCampaign(campaignId);
    }

    const task = this.taskRepo.findById(winner.taskId);
    if (!this.canPromoteVariant(winner, task)) {
      this.campaignRepo.update(campaignId, {
        reviewStatus,
        status: "promoted",
        promotionStatus: "applied",
        promotionError: undefined,
        promotedAt: Date.now(),
        promotedTaskId: winner.taskId,
        promotedBranchName: winner.branchName,
      });
      this.candidateService.markCandidateResolved(campaign.candidateId);
      return this.getCampaign(campaignId);
    }

    return await this.promoteCampaign(campaignId, winner, reviewStatus);
  }

  async runNextExperiment(): Promise<ImprovementCampaign | null> {
    const settings = this.getSettings();
    if (!settings.enabled) return null;
    await this.reconcileActiveCampaigns();
    if (this.campaignRepo.countActive() >= settings.maxConcurrentCampaigns) {
      return null;
    }

    const candidate = await this.pickNextCandidate(settings.requireWorktree);
    if (!candidate) return null;
    return await this.startCampaignForCandidate(candidate, settings);
  }

  async retryCampaign(campaignId: string): Promise<ImprovementCampaign | null> {
    const settings = this.getSettings();
    if (!settings.enabled) {
      throw new Error("Retry could not start because the self-improvement loop is disabled.");
    }
    await this.reconcileActiveCampaigns();
    if (this.campaignRepo.countActive() >= settings.maxConcurrentCampaigns) {
      throw new Error("Retry could not start because the maximum number of active campaigns is already in progress.");
    }
    const prior = this.campaignRepo.findById(campaignId);
    if (!prior) throw new Error("Retry could not start because the previous campaign no longer exists.");
    if (prior.status !== "failed") throw new Error("Retry is only available for failed campaigns.");

    const candidate = this.candidateRepo.findById(prior.candidateId);
    if (!candidate) throw new Error("Retry could not start because the candidate no longer exists.");
    if (candidate.status !== "open") {
      throw new Error(`Retry could not start because the candidate is now ${candidate.status.replace(/_/g, " ")}.`);
    }
    return await this.startCampaignForCandidate(candidate, settings);
  }

  private async startCampaignForCandidate(
    candidate: ImprovementCandidate,
    settings: ImprovementLoopSettings,
  ): Promise<ImprovementCampaign | null> {
    const sourceWorkspace = this.workspaceRepo.findById(candidate.workspaceId);
    if (!sourceWorkspace) return null;
    const executionWorkspace = this.resolveExecutionWorkspace(candidate, sourceWorkspace);
    const baselineMetrics = this.evaluationService.snapshot(settings.evalWindowDays);
    const { trainingEvidence, holdoutEvidence, replayCases } = this.buildReplaySet(candidate, settings);

    const rootTask = this.taskRepo.create({
      title: `Improve campaign: ${candidate.title}`,
      prompt: `Population-based self-improvement campaign for candidate "${candidate.title}".`,
      rawPrompt: `Population-based self-improvement campaign for candidate "${candidate.title}".`,
      status: "planning",
      workspaceId: executionWorkspace.id,
      source: "improvement",
      agentType: "main",
      depth: 0,
      agentConfig: {
        autonomousMode: true,
        allowUserInput: false,
        executionMode: "verified",
        taskDomain: "code",
        reviewPolicy: "strict",
        gatewayContext: "private",
      },
      resultSummary: `Preparing ${settings.variantsPerCampaign} improvement variants.`,
    });

    const campaign = this.campaignRepo.create({
      candidateId: candidate.id,
      workspaceId: candidate.workspaceId,
      executionWorkspaceId: executionWorkspace.id,
      rootTaskId: rootTask.id,
      status: "planning",
      reviewStatus: "pending",
      promotionStatus: "idle",
      baselineMetrics,
      trainingEvidence,
      holdoutEvidence,
      replayCases,
    });

    this.candidateService.markCandidateRunning(candidate.id);

    const lanes = this.selectVariantLanes(settings.variantsPerCampaign);
    const shouldRequireWorktree = await this.shouldRequireWorktreeForWorkspace(
      executionWorkspace.path,
      executionWorkspace.isTemp,
      settings.requireWorktree,
    );
    const program = loadImprovementProgram(executionWorkspace, settings.improvementProgramPath);

    try {
      if (!this.agentDaemon) throw new Error("Agent daemon unavailable");
      const variants = await Promise.all(
        lanes.map(async (lane) => {
          const variant = this.variantRepo.create({
            campaignId: campaign.id,
            candidateId: candidate.id,
            workspaceId: candidate.workspaceId,
            executionWorkspaceId: executionWorkspace.id,
            lane,
            status: "queued",
            baselineMetrics,
          });
          const task = await this.agentDaemon!.createChildTask({
            title: `Improve (${lane}): ${candidate.title}`,
            prompt: buildImprovementVariantPrompt(candidate, lane, {
              sourceWorkspace,
              executionWorkspace,
              relevantLogPaths: this.collectRelevantLogPaths(sourceWorkspace, executionWorkspace),
              trainingEvidence,
              holdoutEvidence,
              replayCases,
              program,
            }),
            workspaceId: executionWorkspace.id,
            parentTaskId: rootTask.id,
            agentType: "sub",
            depth: 1,
            agentConfig: {
              autonomousMode: true,
              allowUserInput: false,
              requireWorktree: shouldRequireWorktree,
              autoApproveTypes: ["run_command"],
              pauseForRequiredDecision: false,
              executionMode: "verified",
              taskDomain: "code",
              reviewPolicy: "strict",
              verificationAgent: true,
              deepWorkMode: true,
              autoContinueOnTurnLimit: true,
              maxAutoContinuations: 1,
              progressJournalEnabled: true,
              gatewayContext: "private",
            },
          });
          this.variantRepo.update(variant.id, {
            taskId: task.id,
            status: "running",
            startedAt: Date.now(),
          });
          return this.variantRepo.findById(variant.id)!;
        }),
      );

      this.campaignRepo.update(campaign.id, {
        status: "running_variants",
        startedAt: Date.now(),
      });
      this.taskRepo.update(rootTask.id, {
        status: "executing",
        resultSummary: `Running ${variants.length} parallel improvement variants.`,
      });

      void this.notify({
        type: "info",
        title: "Improvement campaign started",
        message: `Started ${variants.length} parallel improvement variants for "${candidate.title}".`,
        workspaceId: candidate.workspaceId,
      });
    } catch (error) {
      this.campaignRepo.update(campaign.id, {
        status: "failed",
        completedAt: Date.now(),
        verdictSummary: String((error as Error)?.message || error),
      });
      this.taskRepo.update(rootTask.id, {
        status: "failed",
        terminalStatus: "failed",
        completedAt: Date.now(),
        resultSummary: String((error as Error)?.message || error),
      });
      this.candidateService.reopenCandidate(candidate.id);
      void this.notify({
        type: "task_failed",
        title: "Improvement campaign failed to start",
        message: String((error as Error)?.message || error),
        workspaceId: candidate.workspaceId,
      });
    }

    return this.getCampaign(campaign.id) || null;
  }

  private async finalizeVariant(variantId: string, taskId: string): Promise<void> {
    const variant = this.variantRepo.findById(variantId);
    if (!variant) return;
    const task = this.taskRepo.findById(taskId);
    if (!task || !["completed", "failed", "cancelled"].includes(task.status)) return;

    const settings = this.getSettings();
    const campaign = this.campaignRepo.findById(variant.campaignId);
    if (!campaign) return;

    const evaluation = this.evaluationService.evaluateVariant({
      variant,
      baselineMetrics: campaign.baselineMetrics || this.evaluationService.snapshot(settings.evalWindowDays),
      evalWindowDays: settings.evalWindowDays,
      replayCases: campaign.replayCases,
    });

    this.variantRepo.update(variant.id, {
      status:
        task.status === "cancelled"
          ? "cancelled"
          : evaluation.targetedVerificationPassed
            ? "passed"
            : "failed",
      completedAt: Date.now(),
      outcomeMetrics: this.evaluationService.snapshot(settings.evalWindowDays),
      verdictSummary: evaluation.summary,
      evaluationNotes: evaluation.notes.join("\n"),
      branchName: variant.branchName || task.worktreeBranch,
    });

    await this.finalizeCampaignIfReady(campaign.id);
  }

  private async finalizeCampaignIfReady(campaignId: string): Promise<void> {
    if (this.finalizingCampaignIds.has(campaignId)) return;
    const variants = this.variantRepo.listByCampaignId(campaignId);
    if (variants.some((variant) => variant.status === "queued" || variant.status === "running")) return;

    this.finalizingCampaignIds.add(campaignId);
    try {
      const campaign = this.campaignRepo.findById(campaignId);
      if (!campaign) return;

      const settings = this.getSettings();
      this.campaignRepo.update(campaignId, { status: "judging" });
      const enriched = this.getCampaign(campaignId);
      if (!enriched) return;

      const evaluation = this.evaluationService.evaluateCampaign({
        campaign: enriched,
        variants: enriched.variants,
        evalWindowDays: settings.evalWindowDays,
      });

      this.judgeVerdictRepo.upsert(evaluation.verdict);
      const winner = evaluation.winner
        ? this.variantRepo.findById(evaluation.winner.variantId)
        : undefined;

      const judgePrompt = buildImprovementJudgeSummaryPrompt({
        candidate: this.candidateRepo.findById(enriched.candidateId)!,
        variants: enriched.variants,
        replayCases: enriched.replayCases,
        holdoutEvidence: enriched.holdoutEvidence,
      });

      this.campaignRepo.update(campaignId, {
        status: evaluation.verdict.status === "passed" ? "ready_for_review" : "failed",
        reviewStatus: evaluation.verdict.status === "passed" ? "pending" : "dismissed",
        winnerVariantId: winner?.id,
        verdictSummary: evaluation.verdict.summary,
        evaluationNotes: `${evaluation.verdict.notes.join("\n")}\n\nJudge context:\n${judgePrompt}`,
        outcomeMetrics: evaluation.outcomeMetrics,
        completedAt: Date.now(),
      });
      if (enriched.rootTaskId) {
        this.taskRepo.update(enriched.rootTaskId, {
          status: evaluation.verdict.status === "passed" ? "completed" : "failed",
          terminalStatus: evaluation.verdict.status === "passed" ? "ok" : "failed",
          completedAt: Date.now(),
          resultSummary: evaluation.verdict.summary,
        });
      }

      if (evaluation.verdict.status !== "passed") {
        this.candidateService.reopenCandidate(enriched.candidateId);
        void this.notify({
          type: "task_failed",
          title: "Improvement campaign failed",
          message: evaluation.verdict.summary,
          workspaceId: enriched.workspaceId,
        });
        return;
      }

      this.candidateService.markCandidateReview(enriched.candidateId);
      if (settings.reviewRequired) {
        void this.notify({
          type: "task_completed",
          title: "Improvement campaign ready for review",
          message: evaluation.verdict.summary,
          taskId: winner?.taskId,
          workspaceId: enriched.workspaceId,
        });
      } else if (winner) {
        await this.promoteCampaign(campaignId, winner, "accepted");
      }
    } finally {
      this.finalizingCampaignIds.delete(campaignId);
    }
  }

  private async promoteCampaign(
    campaignId: string,
    winner: ImprovementVariantRun,
    reviewStatus: ImprovementReviewStatus = "accepted",
  ): Promise<ImprovementCampaign | undefined> {
    const campaign = this.campaignRepo.findById(campaignId);
    if (!campaign) return undefined;
    const candidate = this.candidateRepo.findById(campaign.candidateId);
    const promotionMode = this.getSettings().promotionMode;

    this.campaignRepo.update(campaignId, {
      reviewStatus,
      promotionStatus: "promoting",
      promotionError: undefined,
    });
    if (campaign.rootTaskId) {
      this.taskRepo.update(campaign.rootTaskId, {
        resultSummary: `Promoting winner ${winner.lane}.`,
      });
    }

    if (!this.agentDaemon || !winner.taskId) {
      this.campaignRepo.update(campaignId, {
        reviewStatus: "pending",
        promotionStatus: "promotion_failed",
        promotionError: "Agent daemon unavailable",
      });
      return this.getCampaign(campaignId);
    }

    if (promotionMode === "github_pr") {
      const pullRequest = await this.agentDaemon.getWorktreeManager().openPullRequest(winner.taskId, {
        title: this.buildPullRequestTitle(candidate, campaign),
        body: this.buildPullRequestBody(candidate, campaign, winner),
      });
      if (pullRequest.success) {
        this.campaignRepo.update(campaignId, {
          status: "promoted",
          reviewStatus,
          promotionStatus: "pr_opened",
          pullRequest,
          promotionError: undefined,
          promotedAt: Date.now(),
          promotedTaskId: winner.taskId,
          promotedBranchName: winner.branchName,
        });
        this.candidateService.markCandidateResolved(campaign.candidateId);
        if (campaign.rootTaskId) {
          this.taskRepo.update(campaign.rootTaskId, {
            status: "completed",
            terminalStatus: "ok",
            completedAt: Date.now(),
            resultSummary: `Promotion succeeded via pull request from ${winner.lane}.`,
          });
        }
        void this.notify({
          type: "task_completed",
          title: "Improvement PR created",
          message: `Opened a PR for "${candidate?.title || campaign.verdictSummary || "self-improvement campaign"}".`,
          taskId: winner.taskId,
          workspaceId: campaign.workspaceId,
        });
        return this.getCampaign(campaignId);
      }

      this.campaignRepo.update(campaignId, {
        reviewStatus: "pending",
        promotionStatus: "promotion_failed",
        pullRequest,
        promotionError: pullRequest.error || "Failed to open pull request",
      });
      if (campaign.rootTaskId) {
        this.taskRepo.update(campaign.rootTaskId, {
          status: "completed",
          terminalStatus: "partial_success",
          resultSummary: pullRequest.error || "Promotion failed.",
        });
      }
      return this.getCampaign(campaignId);
    }

    const mergeResult = await this.agentDaemon.getWorktreeManager().mergeToBase(winner.taskId);
    if (mergeResult.success) {
      this.campaignRepo.update(campaignId, {
        status: "promoted",
        reviewStatus,
        promotionStatus: "merged",
        mergeResult,
        promotionError: undefined,
        promotedAt: Date.now(),
        promotedTaskId: winner.taskId,
        promotedBranchName: winner.branchName,
      });
      this.candidateService.markCandidateResolved(campaign.candidateId);
      if (campaign.rootTaskId) {
        this.taskRepo.update(campaign.rootTaskId, {
          status: "completed",
          terminalStatus: "ok",
          completedAt: Date.now(),
          resultSummary: `Promotion succeeded via merge from ${winner.lane}.`,
        });
      }
      void this.notify({
        type: "task_completed",
        title: "Improvement merged",
        message: `Merged "${candidate?.title || campaign.verdictSummary || "self-improvement campaign"}" into the base branch.`,
        taskId: winner.taskId,
        workspaceId: campaign.workspaceId,
      });
      return this.getCampaign(campaignId);
    }

    this.campaignRepo.update(campaignId, {
      reviewStatus: "pending",
      promotionStatus: "promotion_failed",
      promotionError: mergeResult?.error || "Merge failed",
    });
    if (campaign.rootTaskId) {
      this.taskRepo.update(campaign.rootTaskId, {
        status: "completed",
        terminalStatus: "partial_success",
        resultSummary: mergeResult?.error || "Merge failed.",
      });
    }
    return this.getCampaign(campaignId);
  }

  private async reconcileActiveCampaigns(): Promise<void> {
    const activeCampaigns = this.campaignRepo.list({ status: ["planning", "running_variants", "judging"] });
    for (const campaign of activeCampaigns) {
      const variants = this.variantRepo.listByCampaignId(campaign.id);
      if (variants.length === 0) {
        this.campaignRepo.update(campaign.id, {
          status: "failed",
          completedAt: Date.now(),
          verdictSummary: "Campaign had no linked variants and was marked failed during reconciliation.",
        });
        this.candidateService.reopenCandidate(campaign.candidateId);
        continue;
      }
      for (const variant of variants) {
        if (!variant.taskId) {
          this.variantRepo.update(variant.id, {
            status: "failed",
            completedAt: Date.now(),
            verdictSummary: "Variant had no linked task and was marked failed during reconciliation.",
          });
          continue;
        }
        const task = this.taskRepo.findById(variant.taskId);
        if (!task) {
          this.variantRepo.update(variant.id, {
            status: "failed",
            completedAt: Date.now(),
            verdictSummary: "Variant task record was missing during reconciliation.",
          });
          continue;
        }
        if (["completed", "failed", "cancelled"].includes(task.status) && (variant.status === "queued" || variant.status === "running")) {
          await this.finalizeVariant(variant.id, variant.taskId);
        }
      }
      await this.finalizeCampaignIfReady(campaign.id);
    }
  }

  private async pickNextCandidate(requireWorktree: boolean): Promise<ImprovementCandidate | undefined> {
    const workspaces = this.workspaceRepo.findAll();
    const ranked: Array<{ candidate: ImprovementCandidate; promotable: boolean }> = [];
    const worktreeManager = this.agentDaemon?.getWorktreeManager();
    for (const workspace of workspaces) {
      const candidate = this.candidateService.getTopCandidateForWorkspace(workspace.id);
      if (!candidate) continue;
      const promotable =
        !!worktreeManager &&
        requireWorktree &&
        (await worktreeManager.shouldUseWorktree(workspace.path, workspace.isTemp));
      ranked.push({ candidate, promotable });
    }
    ranked.sort(
      (a, b) =>
        Number(b.promotable) - Number(a.promotable) ||
        b.candidate.priorityScore - a.candidate.priorityScore ||
        b.candidate.lastSeenAt - a.candidate.lastSeenAt,
    );
    return ranked[0]?.candidate;
  }

  private resolveExecutionWorkspace(candidate: ImprovementCandidate, sourceWorkspace: Workspace): Workspace {
    if (this.isLikelyCoworkCodeWorkspace(sourceWorkspace)) return sourceWorkspace;
    if (!this.candidateExplicitlyTargetsCowork(candidate)) return sourceWorkspace;

    const alternatives = this.workspaceRepo
      .findAll()
      .filter((workspace) => workspace.id !== sourceWorkspace.id)
      .map((workspace) => ({ workspace, score: this.scoreExecutionWorkspace(workspace, candidate) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    return alternatives[0]?.workspace || sourceWorkspace;
  }

  private scoreExecutionWorkspace(workspace: Workspace, candidate: ImprovementCandidate): number {
    let score = 0;
    if (workspace.isTemp) score -= 5;

    const workspaceName = workspace.name.toLowerCase();
    const workspacePath = workspace.path.toLowerCase();
    const candidateText = `${candidate.title} ${candidate.summary}`.toLowerCase();
    const packageJson = this.readPackageMetadata(workspace.path);
    const packageName = packageJson?.name?.toLowerCase?.() || "";

    if (workspaceName.includes("cowork")) score += 6;
    if (workspacePath.includes("/cowork")) score += 6;
    if (packageName.includes("cowork")) score += 10;
    if (fs.existsSync(path.join(workspace.path, "src", "electron"))) score += 4;
    if (fs.existsSync(path.join(workspace.path, "src", "renderer"))) score += 4;
    if (fs.existsSync(path.join(workspace.path, "logs", "dev-latest.log"))) score += 2;
    if (fs.existsSync(path.join(workspace.path, ".git"))) score += 1;
    if (candidateText.includes("cowork") && (workspaceName.includes("cowork") || packageName.includes("cowork"))) {
      score += 4;
    }

    return score;
  }

  private candidateExplicitlyTargetsCowork(candidate: ImprovementCandidate): boolean {
    const parts = [
      candidate.title,
      candidate.summary,
      ...candidate.evidence.flatMap((evidence) => [evidence.summary, evidence.details]),
    ];
    const text = parts
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" ")
      .toLowerCase();
    if (!text) return false;
    return /\bcowork\b|\bcowork os\b|src\/electron|src\/renderer|dev-latest\.log|electron app|renderer\b/.test(text);
  }

  private isLikelyCoworkCodeWorkspace(workspace: Workspace): boolean {
    const score = this.scoreExecutionWorkspace(workspace, {
      id: "",
      workspaceId: workspace.id,
      fingerprint: "",
      source: "task_failure",
      status: "open",
      title: "",
      summary: "",
      severity: 0,
      recurrenceCount: 0,
      fixabilityScore: 0,
      priorityScore: 0,
      evidence: [],
      firstSeenAt: 0,
      lastSeenAt: 0,
    });
    return score >= 18;
  }

  private buildReplaySet(candidate: ImprovementCandidate, settings: ImprovementLoopSettings) {
    const evidence = [...candidate.evidence].sort((a, b) => a.createdAt - b.createdAt);
    const replayCount = Math.min(settings.replaySetSize, Math.max(1, evidence.length - 1));
    const holdoutEvidence = replayCount > 0 ? evidence.slice(-replayCount) : [];
    const trainingEvidence = evidence.slice(0, Math.max(1, evidence.length - holdoutEvidence.length));
    const replayCases = holdoutEvidence.map((item, index) => ({
      id: `${candidate.id}-replay-${index + 1}`,
      candidateId: candidate.id,
      source: item.type,
      summary: item.summary,
      details: item.details,
      createdAt: item.createdAt,
      taskId: item.taskId,
      eventType: item.eventType,
      metadata: item.metadata,
    }));
    return { trainingEvidence, holdoutEvidence, replayCases };
  }

  private selectVariantLanes(count: number): ImprovementVariantLane[] {
    const lanes: ImprovementVariantLane[] = [];
    for (let index = 0; index < count; index += 1) {
      lanes.push(DEFAULT_LANES[index % DEFAULT_LANES.length]);
    }
    return lanes;
  }

  private readPackageMetadata(workspacePath: string): { name?: string } | null {
    const packageJsonPath = path.join(workspacePath, "package.json");
    if (!fs.existsSync(packageJsonPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { name?: string };
    } catch {
      return null;
    }
  }

  private collectRelevantLogPaths(sourceWorkspace: Workspace, executionWorkspace: Workspace): string[] {
    const logPaths = new Set<string>();
    for (const workspace of [executionWorkspace, sourceWorkspace]) {
      const logPath = path.join(workspace.path, "logs", "dev-latest.log");
      if (fs.existsSync(logPath)) logPaths.add(logPath);
    }
    return [...logPaths];
  }

  private enrichCampaigns(campaigns: ImprovementCampaign[]): ImprovementCampaign[] {
    return campaigns.map((campaign) => this.enrichCampaign(campaign));
  }

  private enrichCampaign(campaign: ImprovementCampaign): ImprovementCampaign {
    return {
      ...campaign,
      variants: this.variantRepo.listByCampaignId(campaign.id).map((variant) => {
        if (!variant.taskId) return variant;
        const task = this.taskRepo.findById(variant.taskId);
        return {
          ...variant,
          executionWorkspaceId: task?.workspaceId || variant.executionWorkspaceId,
        };
      }),
      judgeVerdict: this.judgeVerdictRepo.findByCampaignId(campaign.id),
    };
  }

  private getCampaign(campaignId: string): ImprovementCampaign | undefined {
    const campaign = this.campaignRepo.findById(campaignId);
    return campaign ? this.enrichCampaign(campaign) : undefined;
  }

  private async shouldRequireWorktreeForWorkspace(
    workspacePath: string,
    isTemp: boolean | undefined,
    requireWorktree: boolean,
  ): Promise<boolean> {
    if (!requireWorktree) return false;
    const worktreeManager = this.agentDaemon?.getWorktreeManager();
    if (!worktreeManager) return false;
    return await worktreeManager.shouldUseWorktree(workspacePath, isTemp);
  }

  private canPromoteVariant(variant: ImprovementVariantRun, task: Task | undefined): boolean {
    return Boolean(variant.branchName || task?.worktreePath);
  }

  private resetInterval(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }

    const settings = this.getSettings();
    if (!settings.enabled || !settings.autoRun) return;
    this.intervalHandle = setInterval(() => {
      void this.refreshCandidates().then(() => this.runNextExperiment());
    }, settings.intervalMinutes * 60 * 1000);
  }

  private buildPullRequestTitle(candidate: ImprovementCandidate | undefined, campaign: ImprovementCampaign): string {
    if (candidate?.title?.trim()) return `Self-improvement: ${candidate.title.trim()}`;
    return `Self-improvement campaign ${campaign.id.slice(0, 8)}`;
  }

  private buildPullRequestBody(
    candidate: ImprovementCandidate | undefined,
    campaign: ImprovementCampaign,
    winner: ImprovementVariantRun,
  ): string {
    const lines = [
      "## Summary",
      `- ${candidate?.summary?.trim() || campaign.verdictSummary || "Autonomous improvement campaign."}`,
      campaign.verdictSummary ? `- Judge verdict: ${campaign.verdictSummary}` : "",
      `- Winning lane: ${winner.lane}`,
      candidate?.recurrenceCount ? `- Recurrence count: ${candidate.recurrenceCount}` : "",
      "",
      "## Context",
      `- Campaign: ${campaign.id}`,
      `- Variant: ${winner.id}`,
      winner.taskId ? `- Task: ${winner.taskId}` : "",
    ];
    return lines.filter(Boolean).join("\n");
  }

  private async notify(params: {
    type: NotificationType;
    title: string;
    message: string;
    taskId?: string;
    workspaceId?: string;
  }): Promise<void> {
    try {
      await this.deps.notify?.(params);
    } catch (error) {
      console.error("[ImprovementLoopService] Failed to emit notification:", error);
    }
  }
}
