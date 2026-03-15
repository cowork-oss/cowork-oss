import { describe, it, expect, vi } from "vitest";
import { RiskClassifier } from "../RiskClassifier";
import { ConfirmationGate } from "../ConfirmationGate";
import type { GuardrailSettings } from "../../../shared/types";

// Minimal settings helper
function makeSettings(
  hitlEnabled: boolean,
  hitlRiskThreshold: "low" | "medium" | "high" = "high",
): Partial<GuardrailSettings> {
  return { hitlEnabled, hitlRiskThreshold };
}

describe("RiskClassifier", () => {
  it("classifies delete_file as high risk", () => {
    const c = RiskClassifier.classify("delete_file", {});
    expect(c.risk).toBe("high");
  });

  it("classifies run_command as medium risk by default", () => {
    const c = RiskClassifier.classify("run_command", { command: "ls -la" });
    expect(c.risk).toBe("medium");
  });

  it("escalates run_command to high risk when rm -rf is present", () => {
    const c = RiskClassifier.classify("run_command", { command: "rm -rf /tmp/test" });
    expect(c.risk).toBe("high");
  });

  it("classifies execute_code as medium risk", () => {
    const c = RiskClassifier.classify("execute_code", { language: "python", code: "print(1)" });
    expect(c.risk).toBe("medium");
  });

  it("classifies read_file as low risk", () => {
    const c = RiskClassifier.classify("read_file", { path: "/some/file" });
    expect(c.risk).toBe("low");
  });

  describe("shouldRequireConfirmation", () => {
    it("returns false when hitl is disabled", () => {
      const settings = makeSettings(false);
      const c = RiskClassifier.classify("delete_file", {});
      expect(RiskClassifier.shouldRequireConfirmation(c, settings)).toBe(false);
    });

    it("gates high-risk tools when threshold is high", () => {
      const settings = makeSettings(true, "high");
      const highC = RiskClassifier.classify("delete_file", {});
      const midC = RiskClassifier.classify("run_command", { command: "ls" });
      expect(RiskClassifier.shouldRequireConfirmation(highC, settings)).toBe(true);
      expect(RiskClassifier.shouldRequireConfirmation(midC, settings)).toBe(false);
    });

    it("gates medium and high when threshold is medium", () => {
      const settings = makeSettings(true, "medium");
      const highC = RiskClassifier.classify("delete_file", {});
      const midC = RiskClassifier.classify("run_command", { command: "ls" });
      const lowC = RiskClassifier.classify("read_file", {});
      expect(RiskClassifier.shouldRequireConfirmation(highC, settings)).toBe(true);
      expect(RiskClassifier.shouldRequireConfirmation(midC, settings)).toBe(true);
      expect(RiskClassifier.shouldRequireConfirmation(lowC, settings)).toBe(false);
    });

    it("gates everything when threshold is low", () => {
      const settings = makeSettings(true, "low");
      const lowC = RiskClassifier.classify("read_file", {});
      expect(RiskClassifier.shouldRequireConfirmation(lowC, settings)).toBe(true);
    });
  });
});

describe("ConfirmationGate", () => {
  it("auto-allows when hitl is disabled", async () => {
    const requestApproval = vi.fn();
    const gate = new ConfirmationGate({
      requestApproval,
      getGuardrailSettings: () => ({ hitlEnabled: false } as GuardrailSettings),
    });

    const result = await gate.checkTool("task-1", "delete_file", {});
    expect(result.proceed).toBe(true);
    expect(result.autoAllowed).toBe(true);
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("auto-allows low-risk tools when threshold is high", async () => {
    const requestApproval = vi.fn();
    const gate = new ConfirmationGate({
      requestApproval,
      getGuardrailSettings: () =>
        ({ hitlEnabled: true, hitlRiskThreshold: "high" }) as GuardrailSettings,
    });

    const result = await gate.checkTool("task-1", "read_file", { path: "/foo" });
    expect(result.proceed).toBe(true);
    expect(result.autoAllowed).toBe(true);
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("calls requestApproval for high-risk tools when threshold is high", async () => {
    const requestApproval = vi.fn().mockResolvedValue(true);
    const gate = new ConfirmationGate({
      requestApproval,
      getGuardrailSettings: () =>
        ({ hitlEnabled: true, hitlRiskThreshold: "high" }) as GuardrailSettings,
    });

    const result = await gate.checkTool("task-1", "delete_file", { path: "/important" });
    expect(requestApproval).toHaveBeenCalledWith(
      "task-1",
      "risk_gate",
      expect.stringContaining("high"),
      expect.objectContaining({ toolName: "delete_file" }),
    );
    expect(result.proceed).toBe(true);
  });

  it("blocks when user denies approval", async () => {
    const requestApproval = vi.fn().mockResolvedValue(false);
    const gate = new ConfirmationGate({
      requestApproval,
      getGuardrailSettings: () =>
        ({ hitlEnabled: true, hitlRiskThreshold: "high" }) as GuardrailSettings,
    });

    const result = await gate.checkTool("task-1", "delete_file", {});
    expect(result.proceed).toBe(false);
  });
});
