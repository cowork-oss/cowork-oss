import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import type {
  EvalBaselineMetrics,
  ImprovementCampaign,
  ImprovementEvidence,
  ImprovementJudgeVerdict,
  ImprovementCandidate,
  ImprovementReplayCase,
  ImprovementRun,
  ImprovementVariantRun,
  MergeResult,
  PullRequestResult,
} from "../../shared/types";

function safeJsonParse<T>(jsonString: string | null, defaultValue: T): T {
  if (!jsonString) return defaultValue;
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    return defaultValue;
  }
}

export class ImprovementCandidateRepository {
  constructor(private db: Database.Database) {}

  create(
    input: Omit<ImprovementCandidate, "id" | "firstSeenAt" | "lastSeenAt"> & {
      id?: string;
      firstSeenAt?: number;
      lastSeenAt?: number;
    },
  ): ImprovementCandidate {
    const now = Date.now();
    const candidate: ImprovementCandidate = {
      ...input,
      id: input.id || uuidv4(),
      firstSeenAt: input.firstSeenAt ?? now,
      lastSeenAt: input.lastSeenAt ?? now,
    };

    this.db
      .prepare(
        `
        INSERT INTO improvement_candidates (
          id, workspace_id, fingerprint, source, status, title, summary,
          severity, recurrence_count, fixability_score, priority_score,
          evidence, last_task_id, last_event_type, first_seen_at, last_seen_at,
          last_experiment_at, resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        candidate.id,
        candidate.workspaceId,
        candidate.fingerprint,
        candidate.source,
        candidate.status,
        candidate.title,
        candidate.summary,
        candidate.severity,
        candidate.recurrenceCount,
        candidate.fixabilityScore,
        candidate.priorityScore,
        JSON.stringify(candidate.evidence || []),
        candidate.lastTaskId || null,
        candidate.lastEventType || null,
        candidate.firstSeenAt,
        candidate.lastSeenAt,
        candidate.lastExperimentAt || null,
        candidate.resolvedAt || null,
      );

    return candidate;
  }

  update(id: string, updates: Partial<ImprovementCandidate>): void {
    const fields: string[] = [];
    const values: unknown[] = [];
    const mapped: Record<string, string> = {
      workspaceId: "workspace_id",
      recurrenceCount: "recurrence_count",
      fixabilityScore: "fixability_score",
      priorityScore: "priority_score",
      lastTaskId: "last_task_id",
      lastEventType: "last_event_type",
      firstSeenAt: "first_seen_at",
      lastSeenAt: "last_seen_at",
      lastExperimentAt: "last_experiment_at",
      resolvedAt: "resolved_at",
    };

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = mapped[key] || key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
      fields.push(`${dbKey} = ?`);
      values.push(key === "evidence" ? JSON.stringify(value || []) : (value ?? null));
    }

    if (fields.length === 0) return;
    values.push(id);
    this.db.prepare(`UPDATE improvement_candidates SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  }

  findById(id: string): ImprovementCandidate | undefined {
    const row = this.db.prepare("SELECT * FROM improvement_candidates WHERE id = ?").get(id) as Any;
    return row ? this.mapCandidate(row) : undefined;
  }

  findByFingerprint(workspaceId: string, fingerprint: string): ImprovementCandidate | undefined {
    const row = this.db
      .prepare("SELECT * FROM improvement_candidates WHERE workspace_id = ? AND fingerprint = ? LIMIT 1")
      .get(workspaceId, fingerprint) as Any;
    return row ? this.mapCandidate(row) : undefined;
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM improvement_candidates WHERE id = ?").run(id);
  }

  list(params?: {
    workspaceId?: string;
    status?: ImprovementCandidate["status"] | ImprovementCandidate["status"][];
    limit?: number;
  }): ImprovementCandidate[] {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (params?.workspaceId) {
      conditions.push("workspace_id = ?");
      values.push(params.workspaceId);
    }
    if (params?.status) {
      const statuses = Array.isArray(params.status) ? params.status : [params.status];
      conditions.push(`status IN (${statuses.map(() => "?").join(", ")})`);
      values.push(...statuses);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitSql =
      typeof params?.limit === "number" && Number.isFinite(params.limit) ? `LIMIT ${params.limit}` : "";
    const rows = this.db
      .prepare(`SELECT * FROM improvement_candidates ${where} ORDER BY priority_score DESC, last_seen_at DESC ${limitSql}`)
      .all(...values) as Any[];
    return rows.map((row) => this.mapCandidate(row));
  }

  getTopRunnableCandidate(workspaceId: string, maxOpenCandidates = 25): ImprovementCandidate | undefined {
    const row = this.db
      .prepare(
        `
        SELECT *
        FROM improvement_candidates
        WHERE workspace_id = ?
          AND status = 'open'
        ORDER BY priority_score DESC, last_seen_at DESC
        LIMIT ?
      `,
      )
      .get(workspaceId, maxOpenCandidates) as Any;
    return row ? this.mapCandidate(row) : undefined;
  }

  private mapCandidate(row: Any): ImprovementCandidate {
    return {
      id: String(row.id),
      workspaceId: String(row.workspace_id),
      fingerprint: String(row.fingerprint),
      source: row.source,
      status: row.status,
      title: String(row.title),
      summary: String(row.summary),
      severity: Number(row.severity || 0),
      recurrenceCount: Number(row.recurrence_count || 0),
      fixabilityScore: Number(row.fixability_score || 0),
      priorityScore: Number(row.priority_score || 0),
      evidence: safeJsonParse<ImprovementEvidence[]>(row.evidence, []),
      lastTaskId: row.last_task_id || undefined,
      lastEventType: row.last_event_type || undefined,
      firstSeenAt: Number(row.first_seen_at || 0),
      lastSeenAt: Number(row.last_seen_at || 0),
      lastExperimentAt: row.last_experiment_at ? Number(row.last_experiment_at) : undefined,
      resolvedAt: row.resolved_at ? Number(row.resolved_at) : undefined,
    };
  }
}

export class ImprovementRunRepository {
  constructor(private db: Database.Database) {}

  create(input: Omit<ImprovementRun, "id" | "createdAt"> & { id?: string; createdAt?: number }): ImprovementRun {
    const run: ImprovementRun = {
      ...input,
      id: input.id || uuidv4(),
      createdAt: input.createdAt ?? Date.now(),
    };

    this.db
      .prepare(
        `
        INSERT INTO improvement_runs (
          id, candidate_id, workspace_id, status, review_status, promotion_status,
          task_id, branch_name, merge_result, pull_request, promotion_error, baseline_metrics,
          outcome_metrics, verdict_summary, evaluation_notes, created_at, started_at, completed_at, promoted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        run.id,
        run.candidateId,
        run.workspaceId,
        run.status,
        run.reviewStatus,
        run.promotionStatus || "idle",
        run.taskId || null,
        run.branchName || null,
        run.mergeResult ? JSON.stringify(run.mergeResult) : null,
        run.pullRequest ? JSON.stringify(run.pullRequest) : null,
        run.promotionError || null,
        run.baselineMetrics ? JSON.stringify(run.baselineMetrics) : null,
        run.outcomeMetrics ? JSON.stringify(run.outcomeMetrics) : null,
        run.verdictSummary || null,
        run.evaluationNotes || null,
        run.createdAt,
        run.startedAt || null,
        run.completedAt || null,
        run.promotedAt || null,
      );

    return run;
  }

  update(id: string, updates: Partial<ImprovementRun>): void {
    this.updateTable("improvement_runs", id, updates, {
      candidateId: "candidate_id",
      workspaceId: "workspace_id",
      reviewStatus: "review_status",
      promotionStatus: "promotion_status",
      taskId: "task_id",
      branchName: "branch_name",
      mergeResult: "merge_result",
      pullRequest: "pull_request",
      promotionError: "promotion_error",
      baselineMetrics: "baseline_metrics",
      outcomeMetrics: "outcome_metrics",
      verdictSummary: "verdict_summary",
      evaluationNotes: "evaluation_notes",
      createdAt: "created_at",
      startedAt: "started_at",
      completedAt: "completed_at",
      promotedAt: "promoted_at",
    });
  }

  findById(id: string): ImprovementRun | undefined {
    const row = this.db.prepare("SELECT * FROM improvement_runs WHERE id = ?").get(id) as Any;
    return row ? this.mapRun(row) : undefined;
  }

  findByTaskId(taskId: string): ImprovementRun | undefined {
    const row = this.db
      .prepare("SELECT * FROM improvement_runs WHERE task_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(taskId) as Any;
    return row ? this.mapRun(row) : undefined;
  }

  reassignCandidate(fromCandidateId: string, toCandidateId: string): void {
    this.db.prepare("UPDATE improvement_runs SET candidate_id = ? WHERE candidate_id = ?").run(toCandidateId, fromCandidateId);
  }

  list(params?: {
    workspaceId?: string;
    candidateId?: string;
    status?: ImprovementRun["status"] | ImprovementRun["status"][];
    reviewStatus?: ImprovementRun["reviewStatus"] | ImprovementRun["reviewStatus"][];
    limit?: number;
  }): ImprovementRun[] {
    const { where, values, limitSql } = buildFilterSql(params, {
      workspaceId: "workspace_id",
      candidateId: "candidate_id",
      status: "status",
      reviewStatus: "review_status",
    });
    const rows = this.db
      .prepare(`SELECT * FROM improvement_runs ${where} ORDER BY created_at DESC ${limitSql}`)
      .all(...values) as Any[];
    return rows.map((row) => this.mapRun(row));
  }

  countActive(): number {
    const row = this.db.prepare("SELECT COUNT(*) as count FROM improvement_runs WHERE status IN ('queued', 'running')").get() as {
      count: number;
    };
    return Number(row?.count || 0);
  }

  private mapRun(row: Any): ImprovementRun {
    return {
      id: String(row.id),
      candidateId: String(row.candidate_id),
      workspaceId: String(row.workspace_id),
      status: row.status,
      reviewStatus: row.review_status,
      promotionStatus: row.promotion_status || "idle",
      taskId: row.task_id || undefined,
      branchName: row.branch_name || undefined,
      mergeResult: safeJsonParse<MergeResult | undefined>(row.merge_result, undefined),
      pullRequest: safeJsonParse<PullRequestResult | undefined>(row.pull_request, undefined),
      promotionError: row.promotion_error || undefined,
      baselineMetrics: safeJsonParse<EvalBaselineMetrics | undefined>(row.baseline_metrics, undefined),
      outcomeMetrics: safeJsonParse<EvalBaselineMetrics | undefined>(row.outcome_metrics, undefined),
      verdictSummary: row.verdict_summary || undefined,
      evaluationNotes: row.evaluation_notes || undefined,
      createdAt: Number(row.created_at || 0),
      startedAt: row.started_at ? Number(row.started_at) : undefined,
      completedAt: row.completed_at ? Number(row.completed_at) : undefined,
      promotedAt: row.promoted_at ? Number(row.promoted_at) : undefined,
    };
  }

  private updateTable(table: string, id: string, updates: Record<string, unknown>, mapped: Record<string, string>) {
    updateJsonAwareTable(this.db, table, id, updates, mapped);
  }
}

export class ImprovementCampaignRepository {
  constructor(private db: Database.Database) {}

  create(
    input: Omit<ImprovementCampaign, "id" | "createdAt" | "variants" | "judgeVerdict"> & {
      id?: string;
      createdAt?: number;
      variants?: ImprovementVariantRun[];
      judgeVerdict?: ImprovementJudgeVerdict;
    },
  ): ImprovementCampaign {
    const campaign: ImprovementCampaign = {
      ...input,
      id: input.id || uuidv4(),
      variants: input.variants || [],
      judgeVerdict: input.judgeVerdict,
      createdAt: input.createdAt ?? Date.now(),
    };

    this.db
      .prepare(
        `
        INSERT INTO improvement_campaigns (
          id, candidate_id, workspace_id, execution_workspace_id, root_task_id, status, review_status, promotion_status,
          winner_variant_id, promoted_task_id, promoted_branch_name, merge_result, pull_request, promotion_error,
          baseline_metrics, outcome_metrics, verdict_summary, evaluation_notes, training_evidence, holdout_evidence,
          replay_cases, created_at, started_at, completed_at, promoted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        campaign.id,
        campaign.candidateId,
        campaign.workspaceId,
        campaign.executionWorkspaceId || null,
        campaign.rootTaskId || null,
        campaign.status,
        campaign.reviewStatus,
        campaign.promotionStatus || "idle",
        campaign.winnerVariantId || null,
        campaign.promotedTaskId || null,
        campaign.promotedBranchName || null,
        campaign.mergeResult ? JSON.stringify(campaign.mergeResult) : null,
        campaign.pullRequest ? JSON.stringify(campaign.pullRequest) : null,
        campaign.promotionError || null,
        campaign.baselineMetrics ? JSON.stringify(campaign.baselineMetrics) : null,
        campaign.outcomeMetrics ? JSON.stringify(campaign.outcomeMetrics) : null,
        campaign.verdictSummary || null,
        campaign.evaluationNotes || null,
        JSON.stringify(campaign.trainingEvidence || []),
        JSON.stringify(campaign.holdoutEvidence || []),
        JSON.stringify(campaign.replayCases || []),
        campaign.createdAt,
        campaign.startedAt || null,
        campaign.completedAt || null,
        campaign.promotedAt || null,
      );
    return campaign;
  }

  update(id: string, updates: Partial<ImprovementCampaign>): void {
    updateJsonAwareTable(this.db, "improvement_campaigns", id, updates, {
      candidateId: "candidate_id",
      workspaceId: "workspace_id",
      executionWorkspaceId: "execution_workspace_id",
      rootTaskId: "root_task_id",
      reviewStatus: "review_status",
      promotionStatus: "promotion_status",
      winnerVariantId: "winner_variant_id",
      promotedTaskId: "promoted_task_id",
      promotedBranchName: "promoted_branch_name",
      mergeResult: "merge_result",
      pullRequest: "pull_request",
      promotionError: "promotion_error",
      baselineMetrics: "baseline_metrics",
      outcomeMetrics: "outcome_metrics",
      verdictSummary: "verdict_summary",
      evaluationNotes: "evaluation_notes",
      trainingEvidence: "training_evidence",
      holdoutEvidence: "holdout_evidence",
      replayCases: "replay_cases",
      createdAt: "created_at",
      startedAt: "started_at",
      completedAt: "completed_at",
      promotedAt: "promoted_at",
    });
  }

  findById(id: string): ImprovementCampaign | undefined {
    const row = this.db.prepare("SELECT * FROM improvement_campaigns WHERE id = ?").get(id) as Any;
    return row ? this.mapCampaign(row) : undefined;
  }

  findByWinnerVariantId(variantId: string): ImprovementCampaign | undefined {
    const row = this.db
      .prepare("SELECT * FROM improvement_campaigns WHERE winner_variant_id = ? LIMIT 1")
      .get(variantId) as Any;
    return row ? this.mapCampaign(row) : undefined;
  }

  findByTaskId(taskId: string): ImprovementCampaign | undefined {
    const row = this.db
      .prepare(
        `
        SELECT c.*
        FROM improvement_campaigns c
        INNER JOIN improvement_variant_runs v ON v.campaign_id = c.id
        WHERE v.task_id = ?
        ORDER BY c.created_at DESC
        LIMIT 1
      `,
      )
      .get(taskId) as Any;
    return row ? this.mapCampaign(row) : undefined;
  }

  list(params?: {
    workspaceId?: string;
    candidateId?: string;
    status?: ImprovementCampaign["status"] | ImprovementCampaign["status"][];
    reviewStatus?: ImprovementCampaign["reviewStatus"] | ImprovementCampaign["reviewStatus"][];
    limit?: number;
  }): ImprovementCampaign[] {
    const { where, values, limitSql } = buildFilterSql(params, {
      workspaceId: "workspace_id",
      candidateId: "candidate_id",
      status: "status",
      reviewStatus: "review_status",
    });
    const rows = this.db
      .prepare(`SELECT * FROM improvement_campaigns ${where} ORDER BY created_at DESC ${limitSql}`)
      .all(...values) as Any[];
    return rows.map((row) => this.mapCampaign(row));
  }

  countActive(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM improvement_campaigns WHERE status IN ('planning', 'running_variants', 'judging')")
      .get() as { count: number };
    return Number(row?.count || 0);
  }

  private mapCampaign(row: Any): ImprovementCampaign {
    return {
      id: String(row.id),
      candidateId: String(row.candidate_id),
      workspaceId: String(row.workspace_id),
      executionWorkspaceId: row.execution_workspace_id || undefined,
      rootTaskId: row.root_task_id || undefined,
      status: row.status,
      reviewStatus: row.review_status,
      promotionStatus: row.promotion_status || "idle",
      winnerVariantId: row.winner_variant_id || undefined,
      promotedTaskId: row.promoted_task_id || undefined,
      promotedBranchName: row.promoted_branch_name || undefined,
      mergeResult: safeJsonParse<MergeResult | undefined>(row.merge_result, undefined),
      pullRequest: safeJsonParse<PullRequestResult | undefined>(row.pull_request, undefined),
      promotionError: row.promotion_error || undefined,
      baselineMetrics: safeJsonParse<EvalBaselineMetrics | undefined>(row.baseline_metrics, undefined),
      outcomeMetrics: safeJsonParse<EvalBaselineMetrics | undefined>(row.outcome_metrics, undefined),
      verdictSummary: row.verdict_summary || undefined,
      evaluationNotes: row.evaluation_notes || undefined,
      trainingEvidence: safeJsonParse<ImprovementEvidence[]>(row.training_evidence, []),
      holdoutEvidence: safeJsonParse<ImprovementEvidence[]>(row.holdout_evidence, []),
      replayCases: safeJsonParse<ImprovementReplayCase[]>(row.replay_cases, []),
      variants: [],
      judgeVerdict: undefined,
      createdAt: Number(row.created_at || 0),
      startedAt: row.started_at ? Number(row.started_at) : undefined,
      completedAt: row.completed_at ? Number(row.completed_at) : undefined,
      promotedAt: row.promoted_at ? Number(row.promoted_at) : undefined,
    };
  }
}

export class ImprovementVariantRunRepository {
  constructor(private db: Database.Database) {}

  create(
    input: Omit<ImprovementVariantRun, "id" | "createdAt"> & { id?: string; createdAt?: number },
  ): ImprovementVariantRun {
    const run: ImprovementVariantRun = {
      ...input,
      id: input.id || uuidv4(),
      createdAt: input.createdAt ?? Date.now(),
    };

    this.db
      .prepare(
        `
        INSERT INTO improvement_variant_runs (
          id, campaign_id, candidate_id, workspace_id, execution_workspace_id, lane, status,
          task_id, branch_name, baseline_metrics, outcome_metrics, verdict_summary,
          evaluation_notes, created_at, started_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        run.id,
        run.campaignId,
        run.candidateId,
        run.workspaceId,
        run.executionWorkspaceId || null,
        run.lane,
        run.status,
        run.taskId || null,
        run.branchName || null,
        run.baselineMetrics ? JSON.stringify(run.baselineMetrics) : null,
        run.outcomeMetrics ? JSON.stringify(run.outcomeMetrics) : null,
        run.verdictSummary || null,
        run.evaluationNotes || null,
        run.createdAt,
        run.startedAt || null,
        run.completedAt || null,
      );
    return run;
  }

  update(id: string, updates: Partial<ImprovementVariantRun>): void {
    updateJsonAwareTable(this.db, "improvement_variant_runs", id, updates, {
      campaignId: "campaign_id",
      candidateId: "candidate_id",
      workspaceId: "workspace_id",
      executionWorkspaceId: "execution_workspace_id",
      taskId: "task_id",
      branchName: "branch_name",
      baselineMetrics: "baseline_metrics",
      outcomeMetrics: "outcome_metrics",
      verdictSummary: "verdict_summary",
      evaluationNotes: "evaluation_notes",
      createdAt: "created_at",
      startedAt: "started_at",
      completedAt: "completed_at",
    });
  }

  findById(id: string): ImprovementVariantRun | undefined {
    const row = this.db.prepare("SELECT * FROM improvement_variant_runs WHERE id = ?").get(id) as Any;
    return row ? this.mapVariant(row) : undefined;
  }

  findByTaskId(taskId: string): ImprovementVariantRun | undefined {
    const row = this.db
      .prepare("SELECT * FROM improvement_variant_runs WHERE task_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(taskId) as Any;
    return row ? this.mapVariant(row) : undefined;
  }

  list(params?: {
    campaignId?: string;
    workspaceId?: string;
    candidateId?: string;
    status?: ImprovementVariantRun["status"] | ImprovementVariantRun["status"][];
  }): ImprovementVariantRun[] {
    const { where, values } = buildFilterSql(params, {
      campaignId: "campaign_id",
      workspaceId: "workspace_id",
      candidateId: "candidate_id",
      status: "status",
    });
    const rows = this.db
      .prepare(`SELECT * FROM improvement_variant_runs ${where} ORDER BY created_at ASC`)
      .all(...values) as Any[];
    return rows.map((row) => this.mapVariant(row));
  }

  listByCampaignId(campaignId: string): ImprovementVariantRun[] {
    return this.list({ campaignId });
  }

  private mapVariant(row: Any): ImprovementVariantRun {
    return {
      id: String(row.id),
      campaignId: String(row.campaign_id),
      candidateId: String(row.candidate_id),
      workspaceId: String(row.workspace_id),
      executionWorkspaceId: row.execution_workspace_id || undefined,
      lane: row.lane,
      status: row.status,
      taskId: row.task_id || undefined,
      branchName: row.branch_name || undefined,
      baselineMetrics: safeJsonParse<EvalBaselineMetrics | undefined>(row.baseline_metrics, undefined),
      outcomeMetrics: safeJsonParse<EvalBaselineMetrics | undefined>(row.outcome_metrics, undefined),
      verdictSummary: row.verdict_summary || undefined,
      evaluationNotes: row.evaluation_notes || undefined,
      createdAt: Number(row.created_at || 0),
      startedAt: row.started_at ? Number(row.started_at) : undefined,
      completedAt: row.completed_at ? Number(row.completed_at) : undefined,
    };
  }
}

export class ImprovementJudgeVerdictRepository {
  constructor(private db: Database.Database) {}

  upsert(
    input: Omit<ImprovementJudgeVerdict, "id"> & {
      id?: string;
    },
  ): ImprovementJudgeVerdict {
    const verdict: ImprovementJudgeVerdict = {
      ...input,
      id: input.id || uuidv4(),
    };

    this.db
      .prepare(
        `
        INSERT INTO improvement_judge_verdicts (
          id, campaign_id, winner_variant_id, status, summary, notes, variant_rankings, replay_cases, compared_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(campaign_id) DO UPDATE SET
          winner_variant_id = excluded.winner_variant_id,
          status = excluded.status,
          summary = excluded.summary,
          notes = excluded.notes,
          variant_rankings = excluded.variant_rankings,
          replay_cases = excluded.replay_cases,
          compared_at = excluded.compared_at
      `,
      )
      .run(
        verdict.id,
        verdict.campaignId,
        verdict.winnerVariantId || null,
        verdict.status,
        verdict.summary,
        JSON.stringify(verdict.notes || []),
        JSON.stringify(verdict.variantRankings || []),
        JSON.stringify(verdict.replayCases || []),
        verdict.comparedAt,
      );

    return verdict;
  }

  findByCampaignId(campaignId: string): ImprovementJudgeVerdict | undefined {
    const row = this.db
      .prepare("SELECT * FROM improvement_judge_verdicts WHERE campaign_id = ? LIMIT 1")
      .get(campaignId) as Any;
    return row ? this.mapVerdict(row) : undefined;
  }

  private mapVerdict(row: Any): ImprovementJudgeVerdict {
    return {
      id: String(row.id),
      campaignId: String(row.campaign_id),
      winnerVariantId: row.winner_variant_id || undefined,
      status: row.status,
      summary: String(row.summary || ""),
      notes: safeJsonParse<string[]>(row.notes, []),
      variantRankings: safeJsonParse<Array<{ variantId: string; score: number; lane: ImprovementVariantRun["lane"] }>>(
        row.variant_rankings,
        [],
      ),
      replayCases: safeJsonParse<ImprovementReplayCase[]>(row.replay_cases, []),
      comparedAt: Number(row.compared_at || 0),
    };
  }
}

function buildFilterSql(
  params: Record<string, unknown> | undefined,
  mapped: Record<string, string>,
): { where: string; values: unknown[]; limitSql: string } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  for (const [key, dbKey] of Object.entries(mapped)) {
    const value = params?.[key];
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      conditions.push(`${dbKey} IN (${value.map(() => "?").join(", ")})`);
      values.push(...value);
      continue;
    }
    conditions.push(`${dbKey} = ?`);
    values.push(value);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitValue = params && "limit" in params ? Number(params.limit) : undefined;
  const limitSql = typeof limitValue === "number" && Number.isFinite(limitValue) ? `LIMIT ${limitValue}` : "";
  return { where, values, limitSql };
}

function updateJsonAwareTable(
  db: Database.Database,
  table: string,
  id: string,
  updates: Record<string, unknown>,
  mapped: Record<string, string>,
): void {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(updates)) {
    if (key === "variants" || key === "judgeVerdict") continue;
    const dbKey = mapped[key] || key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    fields.push(`${dbKey} = ?`);
    if (
      key === "baselineMetrics" ||
      key === "outcomeMetrics" ||
      key === "mergeResult" ||
      key === "pullRequest" ||
      key === "trainingEvidence" ||
      key === "holdoutEvidence" ||
      key === "replayCases"
    ) {
      values.push(value ? JSON.stringify(value) : key === "trainingEvidence" || key === "holdoutEvidence" || key === "replayCases" ? "[]" : null);
    } else {
      values.push(value ?? null);
    }
  }
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE ${table} SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}
