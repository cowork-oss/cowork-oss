import { describe, it, expect, vi } from "vitest";
import { TaskExecutor } from "../executor";
import { TEMP_WORKSPACE_ID } from "../../../shared/types";

describe("TaskExecutor workspace preflight acknowledgement", () => {
  const buildBase = () => ({
    shouldPauseForQuestions: true,
    workspacePreflightAcknowledged: false,
    capabilityUpgradeRequested: false,
    requiresExecutionToolRun: false,
    allowExecutionWithoutShell: false,
    isInternalAppOrToolChangeIntent: vi.fn(() => false),
    preflightShellExecutionCheck: vi.fn(() => false),
    tryAutoSwitchToPreferredWorkspaceForAmbiguousTask: vi.fn(() => false),
    task: { prompt: "Fix a bug in src/app.ts", id: "t1" },
    classifyWorkspaceNeed: vi.fn(() => "needs_existing"),
    getWorkspaceSignals: vi.fn(() => ({
      hasProjectMarkers: false,
      hasCodeFiles: false,
      hasAppDirs: false,
    })),
  });

  it("pauses on workspace mismatch when acknowledgement is not set", () => {
    const pauseForUserInput = vi.fn();
    const fakeThis: Any = {
      ...buildBase(),
      workspace: { isTemp: false, id: "ws1" },
      pauseForUserInput,
    };

    const shouldPause = (TaskExecutor as Any).prototype.preflightWorkspaceCheck.call(fakeThis);
    expect(shouldPause).toBe(true);
    expect(pauseForUserInput).toHaveBeenCalledTimes(1);
    expect(pauseForUserInput.mock.calls[0][1]).toBe("workspace_mismatch");
  });

  it("does not re-pause once the user acknowledged the preflight warning", () => {
    const pauseForUserInput = vi.fn();
    const fakeThis: Any = {
      ...buildBase(),
      workspacePreflightAcknowledged: true,
      workspace: { isTemp: false, id: "ws1" },
      pauseForUserInput,
    };

    const shouldPause = (TaskExecutor as Any).prototype.preflightWorkspaceCheck.call(fakeThis);
    expect(shouldPause).toBe(false);
    expect(pauseForUserInput).not.toHaveBeenCalled();
  });

  it("applies to temp workspace gates as well", () => {
    const pauseForUserInput = vi.fn();
    const fakeThis: Any = {
      ...buildBase(),
      workspace: { isTemp: true, id: TEMP_WORKSPACE_ID },
      pauseForUserInput,
    };

    const shouldPause = (TaskExecutor as Any).prototype.preflightWorkspaceCheck.call(fakeThis);
    expect(shouldPause).toBe(true);
    expect(pauseForUserInput).toHaveBeenCalledTimes(1);
    expect(pauseForUserInput.mock.calls[0][1]).toBe("workspace_required");
  });

  it("does not pause for ambiguous coding requests in temporary workspace", () => {
    const pauseForUserInput = vi.fn();
    const tryAutoSwitch = vi.fn(() => false);
    const fakeThis: Any = {
      ...buildBase(),
      workspace: { isTemp: true, id: TEMP_WORKSPACE_ID },
      classifyWorkspaceNeed: vi.fn(() => "ambiguous"),
      tryAutoSwitchToPreferredWorkspaceForAmbiguousTask: tryAutoSwitch,
      pauseForUserInput,
    };

    const shouldPause = (TaskExecutor as Any).prototype.preflightWorkspaceCheck.call(fakeThis);
    expect(shouldPause).toBe(false);
    expect(pauseForUserInput).not.toHaveBeenCalled();
    expect(tryAutoSwitch).toHaveBeenCalledTimes(1);
  });

  it("does not pause when capability upgrade intent is active", () => {
    const pauseForUserInput = vi.fn();
    const fakeThis: Any = {
      ...buildBase(),
      capabilityUpgradeRequested: true,
      workspace: { isTemp: true, id: TEMP_WORKSPACE_ID },
      pauseForUserInput,
    };

    const shouldPause = (TaskExecutor as Any).prototype.preflightWorkspaceCheck.call(fakeThis);
    expect(shouldPause).toBe(false);
    expect(pauseForUserInput).not.toHaveBeenCalled();
  });

  it("pauses for shell enablement when task requires command execution and shell is disabled", () => {
    const pauseForUserInput = vi.fn();
    const fakeThis: Any = {
      ...buildBase(),
      workspace: { isTemp: false, id: "ws1", permissions: { shell: false } },
      requiresExecutionToolRun: true,
      allowExecutionWithoutShell: false,
      lastPauseReason: null,
      pauseForUserInput,
    };

    const shouldPause = (TaskExecutor as Any).prototype.preflightShellExecutionCheck.call(fakeThis);
    expect(shouldPause).toBe(true);
    expect(pauseForUserInput).toHaveBeenCalledTimes(1);
    expect(pauseForUserInput.mock.calls[0][1]).toBe("shell_permission_required");
  });

  it("does not pause for shell when user explicitly chose to continue without shell", () => {
    const pauseForUserInput = vi.fn();
    const fakeThis: Any = {
      ...buildBase(),
      workspace: { isTemp: false, id: "ws1", permissions: { shell: false } },
      requiresExecutionToolRun: true,
      allowExecutionWithoutShell: true,
      lastPauseReason: null,
      pauseForUserInput,
    };

    const shouldPause = (TaskExecutor as Any).prototype.preflightShellExecutionCheck.call(fakeThis);
    expect(shouldPause).toBe(false);
    expect(pauseForUserInput).not.toHaveBeenCalled();
  });

  it("does not pause for internal app/tool change intent in temporary workspace", () => {
    const pauseForUserInput = vi.fn();
    const fakeThis: Any = {
      ...buildBase(),
      workspace: { isTemp: true, id: TEMP_WORKSPACE_ID },
      isInternalAppOrToolChangeIntent: vi.fn(() => true),
      pauseForUserInput,
    };

    const shouldPause = (TaskExecutor as Any).prototype.preflightWorkspaceCheck.call(fakeThis);
    expect(shouldPause).toBe(false);
    expect(pauseForUserInput).not.toHaveBeenCalled();
  });

  it("auto-switches to the preferred non-temp workspace for ambiguous temp tasks", () => {
    const preferredWorkspace = {
      id: "ws-preferred",
      name: "Preferred",
      path: process.cwd(),
      permissions: { read: true, write: true, delete: false, network: true, shell: false },
    };
    const fakeThis: Any = {
      workspace: { isTemp: true, id: TEMP_WORKSPACE_ID, path: process.cwd() },
      task: { id: "t1", workspaceId: TEMP_WORKSPACE_ID },
      sandboxRunner: null,
      toolRegistry: { setWorkspace: vi.fn() },
      daemon: {
        getMostRecentNonTempWorkspace: vi.fn(() => preferredWorkspace),
        updateTaskWorkspace: vi.fn(),
        logEvent: vi.fn(),
      },
      getWorkspaceSignalsForPath: vi.fn(() => ({
        hasProjectMarkers: true,
        hasCodeFiles: false,
        hasAppDirs: false,
      })),
    };

    const switched = (
      TaskExecutor as Any
    ).prototype.tryAutoSwitchToPreferredWorkspaceForAmbiguousTask.call(
      fakeThis,
      "ambiguous_temp_workspace",
    );

    expect(switched).toBe(true);
    expect(fakeThis.workspace.id).toBe("ws-preferred");
    expect(fakeThis.task.workspaceId).toBe("ws-preferred");
    expect(fakeThis.toolRegistry.setWorkspace).toHaveBeenCalledWith(preferredWorkspace);
    expect(fakeThis.daemon.updateTaskWorkspace).toHaveBeenCalledWith("t1", "ws-preferred");
  });

  it("does not preflight-fail create/build steps that mention artifacts to be created", () => {
    const fakeThis: Any = Object.create((TaskExecutor as Any).prototype);
    fakeThis.workspace = { path: process.cwd() };
    const step = {
      id: "s1",
      description:
        "Add a simple host entry in SystemMetricsWidgetApp.swift, run a build cycle, and create canvas/system-metrics-widget-preview.html.",
      kind: "primary",
      status: "pending",
    };

    const reason = (TaskExecutor as Any).prototype.getMissingWorkspaceArtifactPreflightReason.call(
      fakeThis,
      step,
    );
    expect(reason).toBeNull();
  });

  it("still preflight-fails verification-only missing artifacts", () => {
    const fakeThis: Any = Object.create((TaskExecutor as Any).prototype);
    fakeThis.workspace = { path: process.cwd() };
    const step = {
      id: "s2",
      description:
        "Verify and inspect SystemMetricsWidgetApp.swift and canvas/system-metrics-widget-preview.html.",
      kind: "verification",
      status: "pending",
    };

    const reason = (TaskExecutor as Any).prototype.getMissingWorkspaceArtifactPreflightReason.call(
      fakeThis,
      step,
    );
    expect(String(reason || "")).toContain("missing_required_workspace_artifact");
  });

  it("does not preflight-fail verification steps that reference remote absolute system paths", () => {
    const fakeThis: Any = Object.create((TaskExecutor as Any).prototype);
    fakeThis.workspace = { path: process.cwd() };
    const step = {
      id: "s2-remote",
      description:
        "Check VM-side SSH service logs via Azure Run Command and inspect `/var/log/auth.log` and `/var/log/secure`.",
      kind: "verification",
      status: "pending",
    };

    const reason = (TaskExecutor as Any).prototype.getMissingWorkspaceArtifactPreflightReason.call(
      fakeThis,
      step,
    );
    expect(reason).toBeNull();
  });

  it("still preflight-fails absolute paths when they are inside the workspace root", () => {
    const fakeThis: Any = Object.create((TaskExecutor as Any).prototype);
    const workspacePath = process.cwd();
    fakeThis.workspace = { path: workspacePath };
    const missingWorkspacePath = `${workspacePath}/tmp/nonexistent-verification-artifact.md`;
    const step = {
      id: "s2-workspace-abs",
      description: `Verify and inspect ${missingWorkspacePath}.`,
      kind: "verification",
      status: "pending",
    };

    const reason = (TaskExecutor as Any).prototype.getMissingWorkspaceArtifactPreflightReason.call(
      fakeThis,
      step,
    );
    expect(String(reason || "")).toContain("missing_required_workspace_artifact");
  });

  it("auto-recovery heuristic includes missing workspace artifact failures", () => {
    const fakeThis: Any = Object.create((TaskExecutor as Any).prototype);
    fakeThis.planRevisionCount = 0;
    fakeThis.maxPlanRevisions = 5;
    fakeThis.classifyRecoveryFailure = vi.fn(() => "local_runtime");
    fakeThis.isRecoveryPlanStep = vi.fn(() => false);
    const step = { id: "s-recovery-1", description: "Check VM-side logs", kind: "primary" };

    const shouldRecover = (TaskExecutor as Any).prototype.shouldAutoPlanRecovery.call(
      fakeThis,
      step,
      "missing_required_workspace_artifact: /var/log/auth.log, /var/log/secure",
    );
    expect(shouldRecover).toBe(true);
  });

  it("auto-recovery heuristic includes cross-step tool block failures", () => {
    const fakeThis: Any = Object.create((TaskExecutor as Any).prototype);
    fakeThis.planRevisionCount = 0;
    fakeThis.maxPlanRevisions = 5;
    fakeThis.classifyRecoveryFailure = vi.fn(() => "local_runtime");
    fakeThis.isRecoveryPlanStep = vi.fn(() => false);
    const step = { id: "s-recovery-2", description: "Run SSH diagnostics", kind: "primary" };

    const shouldRecover = (TaskExecutor as Any).prototype.shouldAutoPlanRecovery.call(
      fakeThis,
      step,
      "Tool run_command has failed 6 times across previous steps",
    );
    expect(shouldRecover).toBe(true);
  });

  it("does not apply cross-step failure hard block to execution tools", () => {
    const fakeThis: Any = Object.create((TaskExecutor as Any).prototype);
    const exemptRunCommand = (TaskExecutor as Any).prototype.isCrossStepFailureBlockExemptTool.call(
      fakeThis,
      "run_command",
    );
    const exemptAppleScript = (TaskExecutor as Any).prototype.isCrossStepFailureBlockExemptTool.call(
      fakeThis,
      "run_applescript",
    );
    const exemptWebSearch = (TaskExecutor as Any).prototype.isCrossStepFailureBlockExemptTool.call(
      fakeThis,
      "web_search",
    );

    expect(exemptRunCommand).toBe(true);
    expect(exemptAppleScript).toBe(true);
    expect(exemptWebSearch).toBe(false);
  });

  it("does not preflight-fail mixed verification plus write-note steps", () => {
    const fakeThis: Any = Object.create((TaskExecutor as Any).prototype);
    fakeThis.workspace = { path: process.cwd() };
    const step = {
      id: "s3",
      description:
        "Verify: run a full functional pass by opening `index.html` and checking interactions; then provide a short usage note in `README.md`.",
      kind: "primary",
      status: "pending",
    };

    const reason = (TaskExecutor as Any).prototype.getMissingWorkspaceArtifactPreflightReason.call(
      fakeThis,
      step,
    );
    expect(reason).toBeNull();
  });

  it("does not preflight-fail draft-and-verify artifact steps when the draft file does not exist yet", () => {
    const fakeThis: Any = Object.create((TaskExecutor as Any).prototype);
    fakeThis.workspace = { path: process.cwd() };
    const step = {
      id: "s3b",
      description:
        "Draft `daily-ai-agent-trends-2026-03-03.md` with sections and verify every claim against source timestamps.",
      kind: "primary",
      status: "pending",
    };

    const reason = (TaskExecutor as Any).prototype.getMissingWorkspaceArtifactPreflightReason.call(
      fakeThis,
      step,
    );
    expect(reason).toBeNull();
  });

  it("ignores command snippets when checking verification artifact preflight", () => {
    const fakeThis: Any = Object.create((TaskExecutor as Any).prototype);
    fakeThis.workspace = { path: process.cwd() };
    const step = {
      id: "s4",
      description:
        "Verification: run the local server (`python3 -m http.server`) and manually validate key flows.",
      kind: "verification",
      status: "pending",
    };

    const reason = (TaskExecutor as Any).prototype.getMissingWorkspaceArtifactPreflightReason.call(
      fakeThis,
      step,
    );
    expect(reason).toBeNull();
  });

  it("requires write_file for write-intent steps that target source/project artifact files", () => {
    const fakeThis: Any = Object.create((TaskExecutor as Any).prototype);
    const requiredTools = (TaskExecutor as Any).prototype.extractRequiredToolsFromStepDescription.call(
      fakeThis,
      "Build widget UI in SystemMetricsWidgetExtension/SystemMetricsWidget.swift and wire the provider.",
    ) as Set<string>;

    expect(requiredTools.has("write_file")).toBe(true);
  });

  it("ignores non-tool via phrases such as localStorage when inferring required tools", () => {
    const fakeThis: Any = Object.create((TaskExecutor as Any).prototype);
    const requiredTools = (TaskExecutor as Any).prototype.extractRequiredToolsFromStepDescription.call(
      fakeThis,
      "Implement Notepad save/load via localStorage and keyboard shortcuts.",
    ) as Set<string>;

    expect(requiredTools.has("localstorage")).toBe(false);
  });

  it("still infers real tools from via phrases when the tool exists", () => {
    const fakeThis: Any = Object.create((TaskExecutor as Any).prototype);
    const requiredTools = (TaskExecutor as Any).prototype.extractRequiredToolsFromStepDescription.call(
      fakeThis,
      "Research the error via web_search and summarize likely root causes.",
    ) as Set<string>;

    expect(requiredTools.has("web_search")).toBe(true);
  });

  it("does not classify setup/naming steps as mutation-required when they only name an output file", () => {
    const fakeThis: Any = Object.create((TaskExecutor as Any).prototype);
    fakeThis.agentPolicyConfig = null;
    const step = {
      id: "s5",
      description:
        "Set research window to the last 24 hours and define output file name `daily-ai-agent-trends-2026-03-03.md`; prepare a short source matrix.",
      kind: "primary",
      status: "pending",
    };

    const contract = (TaskExecutor as Any).prototype.resolveStepExecutionContract.call(fakeThis, step);
    expect(contract.mode).not.toBe("mutation_required");
  });

  it("still infers write_file for explicit draft-to-file steps", () => {
    const fakeThis: Any = Object.create((TaskExecutor as Any).prototype);
    const requiredTools = (TaskExecutor as Any).prototype.extractRequiredToolsFromStepDescription.call(
      fakeThis,
      "Draft daily-ai-agent-trends-2026-03-03.md with sections and citations.",
    ) as Set<string>;

    expect(requiredTools.has("write_file")).toBe(true);
  });
});
