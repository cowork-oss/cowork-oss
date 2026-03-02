import { useMemo, useState } from "react";

interface TextMemoryImportResult {
  success: boolean;
  entriesDetected: number;
  memoriesCreated: number;
  duplicatesSkipped: number;
  truncated: number;
  errors: string[];
}

interface PromptMemoryImportWizardProps {
  workspaceId: string;
  onClose: () => void;
  onImportComplete?: () => void;
}

const PROVIDER_OPTIONS = [
  "Claude",
  "ChatGPT",
  "Gemini",
  "Meta AI",
  "Perplexity",
  "Copilot",
  "Other",
] as const;

const MEMORY_EXPORT_PROMPT = `I'm moving to another service and need to export my data. List every memory you have stored about me, as well as any context you've learned about me from past conversations. Output everything in a single code block so I can easily copy it.

Format each entry as: [date saved, if available] - memory content.

Make sure to cover all of the following —  preserve my words verbatim where possible:
- Instructions I've given you about how to respond (tone, format, style, 'always do X', 'never do Y').
- Personal details: name, location, job, family, interests.
- Projects, goals, and recurring topics.
- Tools, languages, and frameworks I use.
- Preferences and corrections I've made to your behavior.
- Any other stored context not covered above. Do not summarize, group, or omit any entries.

After the code block, confirm whether that is the complete set or if any remain.`;

export function PromptMemoryImportWizard({
  workspaceId,
  onClose,
  onImportComplete,
}: PromptMemoryImportWizardProps) {
  const [provider, setProvider] = useState<string>("Claude");
  const [customProvider, setCustomProvider] = useState<string>("");
  const [pastedText, setPastedText] = useState<string>("");
  const [forcePrivate, setForcePrivate] = useState(true);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<TextMemoryImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolvedProvider = useMemo(() => {
    const value = provider === "Other" ? customProvider.trim() : provider.trim();
    return value || "";
  }, [provider, customProvider]);

  const handleCopyPrompt = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(MEMORY_EXPORT_PROMPT);
      } else {
        const temp = document.createElement("textarea");
        temp.value = MEMORY_EXPORT_PROMPT;
        temp.style.position = "fixed";
        temp.style.left = "-9999px";
        document.body.appendChild(temp);
        temp.focus();
        temp.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(temp);
        if (!copied) throw new Error("Copy failed");
      }
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      setCopyState("error");
    }
  };

  const handleImport = async () => {
    if (!resolvedProvider) {
      setError("Please choose a provider name.");
      return;
    }
    if (!pastedText.trim()) {
      setError("Paste the exported memory text first.");
      return;
    }

    setImporting(true);
    setError(null);
    try {
      const importResult = await window.electronAPI.importMemoryFromText({
        workspaceId,
        provider: resolvedProvider,
        pastedText,
        forcePrivate,
      });
      setResult(importResult);
      if (importResult.memoriesCreated > 0) {
        onImportComplete?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed unexpectedly.");
    } finally {
      setImporting(false);
    }
  };

  const hasCreatedMemories = (result?.memoriesCreated || 0) > 0;

  return (
    <div className="mcp-modal-overlay" onClick={onClose}>
      <div
        className="mcp-modal"
        style={{ width: "min(96vw, 980px)", maxWidth: "980px", maxHeight: "88vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mcp-modal-header">
          <h3 style={{ margin: 0 }}>Import memory from other AI providers</h3>
          <button className="mcp-modal-close" onClick={onClose} aria-label="Close import popup">
            ✕
          </button>
        </div>
        <div className="mcp-modal-content">
          <p className="settings-form-hint" style={{ marginTop: 0 }}>
            Copy a prompt into another chatbot, then paste the output here to import memories
            quickly.
          </p>

          {!result && (
            <div className="chatgpt-import-step" style={{ marginTop: "6px" }}>
              <div className="settings-form-group">
                <div
                  style={{
                    fontWeight: 500,
                    color: "var(--color-text-primary)",
                    marginBottom: "8px",
                  }}
                >
                  1. Copy this prompt and run it in your other AI chat
                </div>
                <textarea
                  readOnly
                  value={MEMORY_EXPORT_PROMPT}
                  style={{
                    width: "100%",
                    minHeight: "220px",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    padding: "12px",
                    background: "var(--color-bg-secondary)",
                    color: "var(--color-text-primary)",
                    fontSize: "14px",
                    lineHeight: 1.45,
                    resize: "vertical",
                  }}
                />
                <div className="chatgpt-import-actions" style={{ justifyContent: "flex-start" }}>
                  <button
                    className="chatgpt-import-btn chatgpt-import-btn-primary"
                    onClick={handleCopyPrompt}
                  >
                    {copyState === "copied" ? "Copied" : "Copy Prompt"}
                  </button>
                  {copyState === "error" && (
                    <span style={{ fontSize: "12px", color: "var(--color-error)" }}>
                      Could not copy automatically. Copy it manually.
                    </span>
                  )}
                </div>
              </div>

              <div className="settings-form-group">
                <label className="settings-label">Provider</label>
                <select
                  className="settings-select"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                >
                  {PROVIDER_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {provider === "Other" && (
                  <input
                    className="settings-input"
                    type="text"
                    value={customProvider}
                    onChange={(e) => setCustomProvider(e.target.value)}
                    placeholder="Enter provider name"
                    style={{ marginTop: "8px" }}
                  />
                )}
              </div>

              <div className="settings-form-group">
                <div
                  style={{
                    fontWeight: 500,
                    color: "var(--color-text-primary)",
                    marginBottom: "8px",
                  }}
                >
                  2. Paste the full response below
                </div>
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Paste the full exported memory response here"
                  style={{
                    width: "100%",
                    minHeight: "220px",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    padding: "12px",
                    background: "var(--color-bg-secondary)",
                    color: "var(--color-text-primary)",
                    fontSize: "14px",
                    lineHeight: 1.45,
                    resize: "vertical",
                  }}
                />
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
                      Mark imported memories as private
                    </div>
                    <p className="settings-form-hint" style={{ marginTop: "4px", marginBottom: 0 }}>
                      Recommended for imported personal context.
                    </p>
                  </div>
                  <label className="settings-toggle" style={{ flexShrink: 0, marginTop: "2px" }}>
                    <input
                      type="checkbox"
                      checked={forcePrivate}
                      onChange={(e) => setForcePrivate(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              {error && <div className="chatgpt-import-error">{error}</div>}

              <div className="chatgpt-import-actions">
                <button
                  className="chatgpt-import-btn chatgpt-import-btn-primary"
                  onClick={handleImport}
                  disabled={importing}
                  style={{ opacity: importing ? 0.6 : 1 }}
                >
                  {importing ? "Importing..." : "Add to Memory"}
                </button>
                <button
                  className="chatgpt-import-btn chatgpt-import-btn-secondary"
                  onClick={onClose}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {result && (
            <div className="chatgpt-import-step">
              <div
                className={`chatgpt-import-result ${hasCreatedMemories ? "chatgpt-import-result-success" : "chatgpt-import-result-error"}`}
              >
                <h4 style={{ margin: "0 0 8px", color: "var(--color-text-primary)" }}>
                  {hasCreatedMemories ? "Import complete" : "No memories imported"}
                </h4>
                <div className="chatgpt-import-result-stats">
                  <div className="chatgpt-import-result-stat">
                    <strong>{result.entriesDetected}</strong>
                    <span>entries detected</span>
                  </div>
                  <div className="chatgpt-import-result-stat">
                    <strong>{result.memoriesCreated}</strong>
                    <span>memories created</span>
                  </div>
                  {result.duplicatesSkipped > 0 && (
                    <div className="chatgpt-import-result-stat">
                      <strong>{result.duplicatesSkipped}</strong>
                      <span>duplicates skipped</span>
                    </div>
                  )}
                  {result.truncated > 0 && (
                    <div className="chatgpt-import-result-stat">
                      <strong>{result.truncated}</strong>
                      <span>entries not imported (limit)</span>
                    </div>
                  )}
                </div>
                {result.errors.length > 0 && (
                  <p style={{ margin: "10px 0 0", color: "var(--color-error)", fontSize: "13px" }}>
                    {result.errors[0]}
                  </p>
                )}
              </div>

              <div className="chatgpt-import-actions">
                <button className="chatgpt-import-btn chatgpt-import-btn-primary" onClick={onClose}>
                  Done
                </button>
                <button
                  className="chatgpt-import-btn chatgpt-import-btn-secondary"
                  onClick={() => {
                    setResult(null);
                    setPastedText("");
                    setError(null);
                  }}
                >
                  Import Another
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
