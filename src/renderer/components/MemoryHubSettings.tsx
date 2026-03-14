import { useEffect, useMemo, useState } from "react";
import type { MemoryFeaturesSettings, Workspace, WorkspaceKitStatus } from "../../shared/types";
import { MemorySettings } from "./MemorySettings";

const DEFAULT_FEATURES: MemoryFeaturesSettings = {
  contextPackInjectionEnabled: true,
  heartbeatMaintenanceEnabled: true,
};

type BadgeTone = "neutral" | "success" | "warning" | "error";

function getBadgeStyle(tone: BadgeTone) {
  if (tone === "success") {
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      padding: "2px 8px",
      borderRadius: "999px",
      fontSize: "11px",
      fontWeight: 600,
      color: "var(--color-success, #22c55e)",
      border: "1px solid rgba(34, 197, 94, 0.35)",
      background: "rgba(34, 197, 94, 0.12)",
    } as const;
  }

  if (tone === "warning") {
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      padding: "2px 8px",
      borderRadius: "999px",
      fontSize: "11px",
      fontWeight: 600,
      color: "var(--color-warning, #f59e0b)",
      border: "1px solid rgba(245, 158, 11, 0.35)",
      background: "rgba(245, 158, 11, 0.12)",
    } as const;
  }

  if (tone === "error") {
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      padding: "2px 8px",
      borderRadius: "999px",
      fontSize: "11px",
      fontWeight: 600,
      color: "var(--color-error, #ef4444)",
      border: "1px solid rgba(239, 68, 68, 0.35)",
      background: "rgba(239, 68, 68, 0.12)",
    } as const;
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "2px 8px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--color-text-secondary)",
    border: "1px solid var(--color-border)",
    background: "var(--color-surface-secondary, rgba(255, 255, 255, 0.03))",
  } as const;
}

function formatTimestamp(timestamp?: number): string | null {
  if (!timestamp) return null;
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return null;
  }
}

function formatBytes(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MemoryHubSettings(props?: {
  initialWorkspaceId?: string;
  onSettingsChanged?: () => void;
}) {
  const [features, setFeatures] = useState<MemoryFeaturesSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [kitStatus, setKitStatus] = useState<WorkspaceKitStatus | null>(null);
  const [kitLoading, setKitLoading] = useState(false);
  const [kitBusy, setKitBusy] = useState(false);
  const [kitPreset, setKitPreset] = useState<"default" | "venture_operator">("default");
  const [newProjectId, setNewProjectId] = useState("");

  const selectedWorkspace = useMemo(() => {
    return workspaces.find((w) => w.id === selectedWorkspaceId) || null;
  }, [workspaces, selectedWorkspaceId]);

  const kitHealth = useMemo(() => {
    const files = kitStatus?.files || [];
    return {
      staleCount: files.filter((file) => file.stale).length,
      warningCount: kitStatus?.lintWarningCount || 0,
      errorCount: kitStatus?.lintErrorCount || 0,
    };
  }, [kitStatus]);

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setKitStatus(null);
      return;
    }
    void refreshKit();
  }, [selectedWorkspaceId]);

  const loadAll = async () => {
    try {
      setLoading(true);

      const [loadedFeatures, loadedWorkspaces, tempWorkspace] = await Promise.all([
        window.electronAPI.getMemoryFeaturesSettings().catch(() => DEFAULT_FEATURES),
        window.electronAPI.listWorkspaces().catch(() => [] as Workspace[]),
        window.electronAPI.getTempWorkspace().catch(() => null as Workspace | null),
      ]);

      const combined: Workspace[] = [
        ...(tempWorkspace ? [tempWorkspace] : []),
        ...loadedWorkspaces.filter((w) => w.id !== tempWorkspace?.id),
      ];

      setFeatures(loadedFeatures);
      setWorkspaces(combined);
      setSelectedWorkspaceId((prev) => {
        const preferred = (props?.initialWorkspaceId || "").trim();
        if (preferred && combined.some((w) => w.id === preferred)) return preferred;
        if (prev && combined.some((w) => w.id === prev)) return prev;
        return combined[0]?.id || "";
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshKit = async () => {
    if (!selectedWorkspaceId) return;
    try {
      setKitLoading(true);
      const status = await window.electronAPI.getWorkspaceKitStatus(selectedWorkspaceId);
      setKitStatus(status);
    } catch (error) {
      console.error("Failed to load workspace kit status:", error);
      setKitStatus(null);
    } finally {
      setKitLoading(false);
    }
  };

  const initKit = async () => {
    if (!selectedWorkspaceId) return;
    try {
      setKitBusy(true);
      const status = await window.electronAPI.initWorkspaceKit({
        workspaceId: selectedWorkspaceId,
        mode: "missing",
        templatePreset: kitPreset,
      });
      setKitStatus(status);
    } catch (error) {
      console.error("Failed to initialize workspace kit:", error);
    } finally {
      setKitBusy(false);
    }
  };

  const createProject = async () => {
    if (!selectedWorkspaceId) return;
    const projectId = newProjectId.trim();
    if (!projectId) return;
    try {
      setKitBusy(true);
      await window.electronAPI.createWorkspaceKitProject({
        workspaceId: selectedWorkspaceId,
        projectId,
      });
      setNewProjectId("");
      await refreshKit();
    } catch (error) {
      console.error("Failed to create project folder:", error);
    } finally {
      setKitBusy(false);
    }
  };

  const saveFeatures = async (updates: Partial<MemoryFeaturesSettings>) => {
    const next: MemoryFeaturesSettings = { ...(features || DEFAULT_FEATURES), ...updates };
    setFeatures(next);
    try {
      setSaving(true);
      await window.electronAPI.saveMemoryFeaturesSettings(next);
    } catch (error) {
      console.error("Failed to save memory feature settings:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !features) {
    return (
      <div className="settings-section">
        <div className="settings-loading">Loading memory settings...</div>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <h2 className="settings-section-title">Memory</h2>
      <p className="settings-section-description">
        Control memory-related features globally and per workspace.
      </p>

      <div className="settings-subsection">
        <h3>Global Toggles</h3>

        <div className="settings-form-group">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "12px",
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>
                Enable Workspace Context Pack Injection
              </div>
              <p className="settings-form-hint" style={{ marginTop: "4px", marginBottom: 0 }}>
                When enabled, the app may inject redacted notes from <code>.cowork/</code> into
                agent context to improve continuity.
              </p>
            </div>
            <label className="settings-toggle" style={{ flexShrink: 0, marginTop: "2px" }}>
              <input
                type="checkbox"
                checked={features.contextPackInjectionEnabled}
                onChange={(e) => saveFeatures({ contextPackInjectionEnabled: e.target.checked })}
                disabled={saving}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>

        <div className="settings-form-group">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "12px",
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>
                Enable Maintenance Heartbeats
              </div>
              <p className="settings-form-hint" style={{ marginTop: "4px", marginBottom: 0 }}>
                When enabled, lead agents treat <code>.cowork/HEARTBEAT.md</code> as the recurring
                checks contract for proactive maintenance, while staying silent unless they find
                something actionable.
              </p>
            </div>
            <label className="settings-toggle" style={{ flexShrink: 0, marginTop: "2px" }}>
              <input
                type="checkbox"
                checked={features.heartbeatMaintenanceEnabled}
                onChange={(e) => saveFeatures({ heartbeatMaintenanceEnabled: e.target.checked })}
                disabled={saving}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>
      </div>

      <div className="settings-subsection">
        <h3>Per Workspace</h3>

        {workspaces.length === 0 ? (
          <p className="settings-form-hint">No workspaces found.</p>
        ) : (
          <div className="settings-form-group">
            <label className="settings-label">Workspace</label>
            <select
              value={selectedWorkspaceId}
              onChange={(e) => setSelectedWorkspaceId(e.target.value)}
              className="settings-select"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            {selectedWorkspace?.path && (
              <p className="settings-form-hint">
                Path: <code>{selectedWorkspace.path}</code>
              </p>
            )}
            <div style={{ marginTop: "10px" }}>
              <label className="settings-label">Kit Preset</label>
              <select
                value={kitPreset}
                onChange={(e) =>
                  setKitPreset(
                    e.target.value === "venture_operator" ? "venture_operator" : "default",
                  )
                }
                className="settings-select"
              >
                <option value="default">Default workspace kit</option>
                <option value="venture_operator">Venture operator kit</option>
              </select>
              <p className="settings-form-hint">
                Venture operator mode seeds company, KPI, and operating-loop files for founder-led
                autonomous workflows.
              </p>
            </div>
          </div>
        )}

        {selectedWorkspaceId && (
          <div className="settings-form-group" style={{ marginTop: "10px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
              }}
            >
              <div>
                <div style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>
                  Workspace Kit
                </div>
                <p className="settings-form-hint" style={{ margin: 0 }}>
                  Creates recommended <code>.cowork/</code> files for shared, durable context.
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  className="settings-button"
                  onClick={() => void refreshKit()}
                  disabled={kitLoading || kitBusy}
                >
                  {kitLoading ? "Refreshing…" : "Refresh"}
                </button>
                <button
                  className="settings-button primary"
                  onClick={() => void initKit()}
                  disabled={kitBusy}
                >
                  {kitBusy ? "Working…" : "Initialize"}
                </button>
              </div>
            </div>

            {kitStatus && (
              <div style={{ marginTop: "10px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  <span style={getBadgeStyle(kitStatus.hasKitDir ? "success" : "warning")}>
                    {kitStatus.hasKitDir ? ".cowork ready" : ".cowork missing"}
                  </span>
                  <span style={getBadgeStyle(kitStatus.missingCount > 0 ? "error" : "success")}>
                    {kitStatus.missingCount} missing
                  </span>
                  <span style={getBadgeStyle(kitHealth.errorCount > 0 ? "error" : "neutral")}>
                    {kitHealth.errorCount} lint error{kitHealth.errorCount === 1 ? "" : "s"}
                  </span>
                  <span style={getBadgeStyle(kitHealth.warningCount > 0 ? "warning" : "neutral")}>
                    {kitHealth.warningCount} warning{kitHealth.warningCount === 1 ? "" : "s"}
                  </span>
                  <span style={getBadgeStyle(kitHealth.staleCount > 0 ? "warning" : "neutral")}>
                    {kitHealth.staleCount} stale
                  </span>
                  {kitStatus.onboarding && (
                    <span
                      style={
                        getBadgeStyle(
                          kitStatus.onboarding.onboardingCompletedAt
                            ? "success"
                            : kitStatus.onboarding.bootstrapPresent
                              ? "warning"
                              : "neutral",
                        )
                      }
                    >
                      {kitStatus.onboarding.onboardingCompletedAt
                        ? "Onboarding completed"
                        : kitStatus.onboarding.bootstrapPresent
                          ? "Bootstrap active"
                          : "Bootstrap missing"}
                    </span>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                    marginTop: "8px",
                    fontSize: "12px",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <div>{kitStatus.workspacePath ? `Path: ${kitStatus.workspacePath}` : ""}</div>
                  <div>
                    {kitStatus.onboarding?.bootstrapSeededAt
                      ? `Bootstrap seeded ${formatTimestamp(kitStatus.onboarding.bootstrapSeededAt)}`
                      : "Bootstrap not yet seeded"}
                  </div>
                </div>

                {kitStatus.files.length > 0 && (
                  <details style={{ marginTop: "8px" }}>
                    <summary
                      style={{
                        cursor: "pointer",
                        fontSize: "12px",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      Show kit files
                    </summary>
                    <div
                      style={{
                        marginTop: "8px",
                        border: "1px solid var(--color-border)",
                        borderRadius: "6px",
                        overflow: "hidden",
                      }}
                    >
                      {kitStatus.files.map((f, index) => {
                        const warningCount = f.issues?.filter((issue) => issue.level === "warning").length || 0;
                        const errorCount = f.issues?.filter((issue) => issue.level === "error").length || 0;
                        const modifiedAt = formatTimestamp(f.modifiedAt);
                        const sizeLabel = formatBytes(f.sizeBytes);
                        const metadata = [
                          f.title,
                          modifiedAt ? `updated ${modifiedAt}` : null,
                          sizeLabel,
                          typeof f.revisionCount === "number" ? `${f.revisionCount} revision${f.revisionCount === 1 ? "" : "s"}` : null,
                        ].filter(Boolean);

                        return (
                          <div
                            key={f.relPath}
                            style={{
                              padding: "10px",
                              borderBottom:
                                index === kitStatus.files.length - 1
                                  ? "none"
                                  : "1px solid var(--color-border)",
                              fontSize: "12px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: "10px",
                                alignItems: "flex-start",
                              }}
                            >
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <code style={{ color: "var(--color-text-primary)" }}>{f.relPath}</code>
                                  {f.specialHandling === "heartbeat" && (
                                    <span style={getBadgeStyle("warning")}>heartbeat</span>
                                  )}
                                  {f.specialHandling === "bootstrap" && (
                                    <span style={getBadgeStyle("neutral")}>bootstrap</span>
                                  )}
                                </div>
                                {metadata.length > 0 && (
                                  <div
                                    style={{
                                      marginTop: "6px",
                                      color: "var(--color-text-secondary)",
                                      display: "flex",
                                      gap: "8px",
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    {metadata.map((item) => (
                                      <span key={`${f.relPath}:${item}`}>{item}</span>
                                    ))}
                                  </div>
                                )}
                                {f.issues && f.issues.length > 0 && (
                                  <ul
                                    style={{
                                      marginTop: "8px",
                                      marginBottom: 0,
                                      paddingLeft: "18px",
                                      color: "var(--color-text-secondary)",
                                    }}
                                  >
                                    {f.issues.map((issue) => (
                                      <li key={`${f.relPath}:${issue.code}:${issue.message}`}>
                                        <strong
                                          style={{
                                            color:
                                              issue.level === "error"
                                                ? "var(--color-error, #ef4444)"
                                                : "var(--color-warning, #f59e0b)",
                                          }}
                                        >
                                          {issue.code}
                                        </strong>{" "}
                                        {issue.message}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: "6px",
                                  justifyContent: "flex-end",
                                  maxWidth: "40%",
                                }}
                              >
                                <span style={getBadgeStyle(f.exists ? "success" : "error")}>
                                  {f.exists ? "OK" : "MISSING"}
                                </span>
                                {f.stale && <span style={getBadgeStyle("warning")}>stale</span>}
                                {errorCount > 0 && (
                                  <span style={getBadgeStyle("error")}>
                                    {errorCount} error{errorCount === 1 ? "" : "s"}
                                  </span>
                                )}
                                {warningCount > 0 && (
                                  <span style={getBadgeStyle("warning")}>
                                    {warningCount} warning{warningCount === 1 ? "" : "s"}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}
              </div>
            )}

            <div style={{ marginTop: "12px", display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                className="settings-input"
                value={newProjectId}
                onChange={(e) => setNewProjectId(e.target.value)}
                placeholder="New project id (e.g. website-redesign)"
                style={{ flex: 1 }}
              />
              <button
                className="settings-button"
                onClick={() => void createProject()}
                disabled={kitBusy || !newProjectId.trim()}
              >
                Create project
              </button>
            </div>
          </div>
        )}

        {selectedWorkspaceId && (
          <MemorySettings
            workspaceId={selectedWorkspaceId}
            onSettingsChanged={props?.onSettingsChanged}
          />
        )}
      </div>
    </div>
  );
}
