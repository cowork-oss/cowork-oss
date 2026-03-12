import type Database from "better-sqlite3";
import { EvalService } from "../eval/EvalService";
import { TaskEventRepository, TaskRepository } from "../database/repositories";
import type {
  EvalBaselineMetrics,
  ImprovementCampaign,
  ImprovementJudgeVerdict,
  ImprovementReplayCase,
  ImprovementVariantEvaluation,
  ImprovementVariantRun,
  Task,
} from "../../shared/types";

export class ExperimentEvaluationService {
  private readonly evalService: EvalService;
  private readonly taskRepo: TaskRepository;
  private readonly eventRepo: TaskEventRepository;

  constructor(private readonly db: Database.Database) {
    this.evalService = new EvalService(db);
    this.taskRepo = new TaskRepository(db);
    this.eventRepo = new TaskEventRepository(db);
  }

  snapshot(windowDays: number): EvalBaselineMetrics {
    return this.evalService.getBaselineMetrics(windowDays);
  }

  evaluateVariant(params: {
    variant: ImprovementVariantRun;
    baselineMetrics: EvalBaselineMetrics;
    evalWindowDays: number;
    replayCases: ImprovementReplayCase[];
  }): ImprovementVariantEvaluation {
    const task = params.variant.taskId ? this.taskRepo.findById(params.variant.taskId) : undefined;
    const events = task ? this.eventRepo.findByTaskId(task.id) : [];

    const verificationPassed = events.some(
      (event) => event.legacyType === "verification_passed" || event.type === "verification_passed",
    );
    const verificationFailed = events.some(
      (event) => event.legacyType === "verification_failed" || event.type === "verification_failed",
    );
    const reviewFailed = events.some(
      (event) => event.legacyType === "review_quality_failed" || event.type === "review_quality_failed",
    );

    const targetedVerificationPassed =
      !!task &&
      task.status === "completed" &&
      task.terminalStatus !== "failed" &&
      !verificationFailed &&
      !reviewFailed;
    const failureClassResolved =
      !!task && task.failureClass !== "required_verification" && task.failureClass !== "contract_error";
    const regressionSignals = collectRegressionSignals(task, verificationFailed, reviewFailed);
    const replayPassRate = computeReplayPassRate(params.replayCases, task, regressionSignals);
    const diffSizePenalty = estimateDiffSizePenalty(task);

    let score = 0;
    if (targetedVerificationPassed) score += 0.45;
    if (verificationPassed) score += 0.1;
    if (failureClassResolved) score += 0.15;
    score += replayPassRate * 0.25;
    score -= diffSizePenalty;
    score -= Math.min(regressionSignals.length, 3) * 0.1;
    score = Number(Math.max(0, Math.min(1, score)).toFixed(4));

    const notes = [
      `Task status: ${task?.status || "missing"}${task?.terminalStatus ? ` (${task.terminalStatus})` : ""}`,
      `Targeted verification: ${targetedVerificationPassed ? "passed" : "failed"}`,
      `Replay pass rate: ${Math.round(replayPassRate * 100)}%`,
    ];
    if (task?.resultSummary) notes.push(`Summary: ${task.resultSummary.slice(0, 400)}`);
    for (const signal of regressionSignals) notes.push(signal);

    return {
      variantId: params.variant.id,
      lane: params.variant.lane,
      score,
      targetedVerificationPassed,
      verificationPassed,
      regressionSignals,
      failureClassResolved,
      replayPassRate,
      diffSizePenalty,
      summary: targetedVerificationPassed
        ? "Variant passed targeted checks."
        : "Variant failed targeted checks or triggered regression signals.",
      notes,
    };
  }

  evaluateCampaign(params: {
    campaign: ImprovementCampaign;
    variants: ImprovementVariantRun[];
    evalWindowDays: number;
  }): {
    verdict: ImprovementJudgeVerdict;
    outcomeMetrics: EvalBaselineMetrics;
    winner?: ImprovementVariantEvaluation;
    evaluations: ImprovementVariantEvaluation[];
  } {
    const evaluations = params.variants.map((variant) =>
      this.evaluateVariant({
        variant,
        baselineMetrics: params.campaign.baselineMetrics || this.snapshot(params.evalWindowDays),
        evalWindowDays: params.evalWindowDays,
        replayCases: params.campaign.replayCases,
      }),
    );
    evaluations.sort((a, b) => b.score - a.score);

    const winner = evaluations.find(
      (candidate) =>
        candidate.targetedVerificationPassed &&
        candidate.replayPassRate >= 0.5 &&
        candidate.regressionSignals.length === 0,
    );

    const verdict: ImprovementJudgeVerdict = {
      id: `judge-${params.campaign.id}`,
      campaignId: params.campaign.id,
      winnerVariantId: winner?.variantId,
      status: winner ? "passed" : "failed",
      summary: winner
        ? `Selected ${winner.lane} as the campaign winner.`
        : "No variant cleared targeted verification and holdout replay gates.",
      notes: evaluations.flatMap((evaluation) => [
        `${evaluation.variantId} (${evaluation.lane}) score=${evaluation.score}`,
        ...evaluation.notes,
      ]),
      comparedAt: Date.now(),
      variantRankings: evaluations.map((evaluation) => ({
        variantId: evaluation.variantId,
        score: evaluation.score,
        lane: evaluation.lane,
      })),
      replayCases: params.campaign.replayCases,
    };

    return {
      verdict,
      outcomeMetrics: this.snapshot(params.evalWindowDays),
      winner,
      evaluations,
    };
  }
}

function collectRegressionSignals(
  task: Task | undefined,
  verificationFailed: boolean,
  reviewFailed: boolean,
): string[] {
  const signals: string[] = [];
  if (!task) {
    signals.push("Task record missing during evaluation.");
    return signals;
  }
  if (task.status !== "completed") signals.push("Task did not complete successfully.");
  if (task.terminalStatus === "failed") signals.push("Task terminal status is failed.");
  if (verificationFailed) signals.push("Verification failed event recorded.");
  if (reviewFailed) signals.push("Review quality failure recorded.");
  if (/regress|broke|still failing|unable|cannot/i.test(String(task.resultSummary || ""))) {
    signals.push("Result summary suggests unresolved or regressed behavior.");
  }
  return signals;
}

function computeReplayPassRate(
  replayCases: ImprovementReplayCase[],
  task: Task | undefined,
  regressionSignals: string[],
): number {
  if (!task) return 0;
  if (replayCases.length === 0) return regressionSignals.length === 0 ? 1 : 0.5;
  const resultText = `${task.resultSummary || ""} ${task.error || ""}`.toLowerCase();
  let passed = 0;
  for (const item of replayCases) {
    const summary = item.summary.toLowerCase();
    const matched =
      summary.length > 0 &&
      (resultText.includes(summary.slice(0, Math.min(summary.length, 32))) ||
        regressionSignals.every((signal) => !signal.toLowerCase().includes(summary.slice(0, 16))));
    if (matched) passed += 1;
  }
  return Number((passed / replayCases.length).toFixed(4));
}

function estimateDiffSizePenalty(task: Task | undefined): number {
  if (!task?.resultSummary) return 0.05;
  const len = task.resultSummary.length;
  if (len <= 240) return 0.02;
  if (len <= 700) return 0.06;
  return 0.12;
}
