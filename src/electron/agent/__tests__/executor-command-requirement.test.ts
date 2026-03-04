import { describe, expect, it } from "vitest";
import { TaskExecutor } from "../executor";

describe("TaskExecutor command execution requirement detection", () => {
  it("treats SSH connectivity failure transcripts as execution-required", () => {
    const fakeThis: Any = Object.create((TaskExecutor as Any).prototype);
    fakeThis.getEffectiveTaskDomain = () => "operations";
    fakeThis.getEffectiveExecutionMode = () => "execute";

    const prompt = [
      "This is the azure VM private address but I cannot connect to it",
      "mesut@host % ssh a_mozsoy@10.213.136.68",
      "Connection closed by 10.213.136.68 port 22",
      "Zscaler is open on my mac",
    ].join("\n");

    const requires = (TaskExecutor as Any).prototype.detectExecutionRequirement.call(fakeThis, prompt);
    expect(requires).toBe(true);
  });

  it("does not force command execution for non-troubleshooting shell mentions", () => {
    const fakeThis: Any = Object.create((TaskExecutor as Any).prototype);
    fakeThis.getEffectiveTaskDomain = () => "operations";
    fakeThis.getEffectiveExecutionMode = () => "execute";

    const requires = (TaskExecutor as Any).prototype.followUpRequiresCommandExecution.call(
      fakeThis,
      "Can you explain what SSH does and when to use it?",
    );
    expect(requires).toBe(false);
  });

  it("keeps analyze mode read-only even for troubleshooting prompts", () => {
    const fakeThis: Any = Object.create((TaskExecutor as Any).prototype);
    fakeThis.getEffectiveTaskDomain = () => "operations";
    fakeThis.getEffectiveExecutionMode = () => "analyze";

    const requires = (TaskExecutor as Any).prototype.followUpRequiresCommandExecution.call(
      fakeThis,
      "ssh user@10.0.0.5 fails with connection refused. Please troubleshoot.",
    );
    expect(requires).toBe(false);
  });
});
