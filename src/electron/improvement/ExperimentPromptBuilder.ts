import fs from "fs";
import path from "path";
import type {
  ImprovementCandidate,
  ImprovementEvidence,
  ImprovementProgramConfig,
  ImprovementReplayCase,
  ImprovementVariantLane,
  ImprovementVariantRun,
  Workspace,
} from "../../shared/types";

interface ImprovementPromptContext {
  sourceWorkspace: Workspace;
  executionWorkspace: Workspace;
  relevantLogPaths?: string[];
  trainingEvidence: ImprovementEvidence[];
  holdoutEvidence: ImprovementEvidence[];
  replayCases: ImprovementReplayCase[];
  program: ImprovementProgramConfig;
}

const DEFAULT_LANE_GUIDANCE: Record<ImprovementVariantLane, string[]> = {
  minimal_patch: [
    "Aim for the smallest diff that resolves the failure evidence.",
    "Do not introduce broad refactors or rename churn.",
  ],
  test_first: [
    "Start by adding or tightening a targeted regression test when the project layout supports it.",
    "Only then implement the minimal production fix needed to make the new check pass.",
  ],
  root_cause: [
    "Trace the concrete failure back to the underlying cause before changing code.",
    "Prefer one cohesive fix over multiple speculative edits.",
  ],
  guardrail_hardening: [
    "Bias toward validation, defensive handling, and prevention of repeat failure modes.",
    "If the issue is already fixed locally, strengthen guards or verification around it.",
  ],
};

export function loadImprovementProgram(
  workspace: Workspace,
  configuredPath?: string,
): ImprovementProgramConfig {
  const candidates = [
    configuredPath && path.isAbsolute(configuredPath) ? configuredPath : undefined,
    configuredPath ? path.join(workspace.path, configuredPath) : undefined,
    path.join(workspace.path, "improvement-program.md"),
  ].filter((value): value is string => !!value);

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const instructions = fs.readFileSync(candidate, "utf8").trim();
      if (!instructions) continue;
      return {
        path: candidate,
        instructions,
        mutablePaths: inferDefaultMutablePaths(instructions),
        forbiddenChanges: [
          "Do not modify unrelated subsystems.",
          "Do not broaden permissions, auth surface, or telemetry behavior without direct evidence.",
        ],
        scoringPriorities: [
          "targeted verification",
          "small reversible diff",
          "replay-set generalization",
        ],
      };
    } catch {
      // Fall back to the default charter.
    }
  }

  return {
    instructions: [
      "You are operating inside CoWork OS self-improvement.",
      "Constrain changes to the smallest subsystem that explains the evidence.",
      "Prefer targeted tests and localized fixes over broad refactors.",
    ].join("\n"),
    mutablePaths: ["Only edit files directly implicated by the failure evidence.", "Prefer one subsystem and one nearby test area."],
    forbiddenChanges: [
      "Do not modify unrelated workspaces or generated artifacts.",
      "Do not add network dependencies unless they already exist in project workflow.",
      "Do not make speculative multi-file rewrites.",
    ],
    scoringPriorities: [
      "fix the reported failure",
      "keep the diff small",
      "avoid regressions on holdout evidence",
    ],
  };
}

export function buildImprovementVariantPrompt(
  candidate: ImprovementCandidate,
  lane: ImprovementVariantLane,
  context: ImprovementPromptContext,
): string {
  const lines: string[] = [
    "You are running one branch in a population-based self-improvement campaign for CoWork OS.",
    `Your strategy lane is: ${lane}.`,
    "",
    "Comparable experiment budget:",
    "- one autonomous task",
    "- one isolated workspace/worktree",
    "- bounded continuations only",
    "- targeted verification only",
    "- no unbounded research loops",
    "",
    "Success contract:",
    "1. Reproduce or tightly validate the training evidence below.",
    "2. Make the smallest lane-consistent fix that improves the issue.",
    "3. Run targeted verification.",
    "4. Summarize what changed, what you verified, and remaining risk.",
    "5. If you cannot confidently improve the issue, stop and explain why.",
    "",
    "Workspace context:",
    `- Observed workspace: ${context.sourceWorkspace.name} (${context.sourceWorkspace.path})`,
    `- Execution workspace: ${context.executionWorkspace.name} (${context.executionWorkspace.path})`,
  ];

  if ((context.relevantLogPaths || []).length > 0) {
    lines.push("- Inspect these logs first:");
    for (const logPath of context.relevantLogPaths || []) {
      lines.push(`  - ${logPath}`);
    }
  }

  lines.push("", "Improvement charter:");
  lines.push(context.program.instructions);
  lines.push("");
  lines.push("Mutable scope:");
  for (const item of context.program.mutablePaths) lines.push(`- ${item}`);
  lines.push("Forbidden changes:");
  for (const item of context.program.forbiddenChanges) lines.push(`- ${item}`);
  lines.push("Scoring priorities:");
  for (const item of context.program.scoringPriorities) lines.push(`- ${item}`);

  lines.push("", "Lane guidance:");
  for (const item of DEFAULT_LANE_GUIDANCE[lane]) lines.push(`- ${item}`);

  lines.push("", `Candidate title: ${candidate.title}`);
  lines.push(`Candidate summary: ${candidate.summary}`);
  lines.push(`Source: ${candidate.source}`);
  lines.push(`Recurrence count: ${candidate.recurrenceCount}`);

  lines.push("", "Training evidence available to this variant:");
  for (const evidence of context.trainingEvidence.slice(-6)) {
    pushEvidence(lines, evidence);
  }

  lines.push("", "Hidden holdout policy:");
  lines.push("- Some replay cases are withheld and will be used after you finish.");
  lines.push("- Do not optimize for imagined hidden cases; solve the concrete issue robustly.");

  lines.push("", "When you finish, include:");
  lines.push("- the reproduction method you used");
  lines.push("- the verification steps you ran");
  lines.push("- whether the issue appears fixed");
  lines.push("- why this lane’s approach is preferable or insufficient");

  return lines.join("\n");
}

export function buildImprovementJudgeSummaryPrompt(params: {
  candidate: ImprovementCandidate;
  variants: ImprovementVariantRun[];
  replayCases: ImprovementReplayCase[];
  holdoutEvidence: ImprovementEvidence[];
}): string {
  const lines = [
    "You are the judge for a self-improvement campaign.",
    "Choose the best variant based on targeted verification, small diff bias, regression avoidance, and holdout generalization.",
    `Candidate: ${params.candidate.title}`,
    `Summary: ${params.candidate.summary}`,
    "",
    "Holdout evidence:",
    ...params.holdoutEvidence.slice(-5).flatMap((evidence) => formatEvidence(evidence)),
    "",
    "Replay cases:",
    ...params.replayCases.slice(0, 8).map((item) => `- [${item.source}] ${item.summary}`),
    "",
    "Variants:",
    ...params.variants.map(
      (variant) =>
        `- ${variant.id} (${variant.lane}) status=${variant.status}; summary=${variant.verdictSummary || "n/a"}; notes=${variant.evaluationNotes || "n/a"}`,
    ),
  ];
  return lines.join("\n");
}

function pushEvidence(lines: string[], evidence: ImprovementEvidence): void {
  for (const line of formatEvidence(evidence)) lines.push(line);
}

function formatEvidence(evidence: ImprovementEvidence): string[] {
  const lines = [`- [${evidence.type}] ${evidence.summary}`];
  if (evidence.details) lines.push(`  Details: ${evidence.details}`);
  if (evidence.taskId) lines.push(`  Task: ${evidence.taskId}`);
  return lines;
}

function inferDefaultMutablePaths(instructions: string): string[] {
  const lowered = instructions.toLowerCase();
  if (lowered.includes("src/electron")) {
    return ["Prefer `src/electron` files implicated by the failure.", "Touch renderer files only if evidence points there."];
  }
  if (lowered.includes("src/renderer")) {
    return ["Prefer `src/renderer` files implicated by the failure.", "Touch Electron code only if necessary for the fix."];
  }
  return ["Only edit files directly implicated by the failure evidence.", "Keep changes close to existing tests or verification helpers."];
}
