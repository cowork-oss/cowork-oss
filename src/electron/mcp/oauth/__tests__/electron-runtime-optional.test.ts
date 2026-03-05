import { describe, expect, it } from "vitest";

describe("Electron-optional OAuth imports", () => {
  it("loads connector OAuth helpers without resolving Electron at import time", async () => {
    const mod = await import("../connector-oauth");
    expect(typeof mod.startConnectorOAuth).toBe("function");
  });

  it("loads Google Workspace OAuth helpers without resolving Electron at import time", async () => {
    const mod = await import("../../../utils/google-workspace-oauth");
    expect(typeof mod.startGoogleWorkspaceOAuth).toBe("function");
  });
});
