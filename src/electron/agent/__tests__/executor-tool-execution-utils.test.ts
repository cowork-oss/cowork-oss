import { describe, expect, it } from "vitest";
import {
  getToolFailureReason,
  getToolInputValidationError,
  isEffectivelyIdempotentToolCall,
  normalizeToolFailureReason,
  preflightValidateAndRepairToolInput,
} from "../executor-tool-execution-utils";

describe("isEffectivelyIdempotentToolCall", () => {
  const baseIdempotent = (toolName: string) =>
    ["read_file", "list_directory", "search_files"].includes(toolName);

  it("returns true for inherently idempotent tools", () => {
    expect(
      isEffectivelyIdempotentToolCall({
        toolName: "read_file",
        input: { path: "README.md" },
        isIdempotentTool: baseIdempotent,
      }),
    ).toBe(true);
  });

  it("treats read-only cloud actions as idempotent", () => {
    expect(
      isEffectivelyIdempotentToolCall({
        toolName: "box_action",
        input: { action: "list_folder_items", folder_id: "0" },
        isIdempotentTool: baseIdempotent,
      }),
    ).toBe(true);
  });

  it("does not treat mutating cloud actions as idempotent", () => {
    expect(
      isEffectivelyIdempotentToolCall({
        toolName: "box_action",
        input: { action: "create_folder", parent_id: "0", name: "new" },
        isIdempotentTool: baseIdempotent,
      }),
    ).toBe(false);
  });
});

describe("getToolInputValidationError", () => {
  it("validates count_text/text_metrics input contracts", () => {
    expect(getToolInputValidationError("count_text", {})).toContain("either 'text' or 'path'");
    expect(getToolInputValidationError("text_metrics", { text: "x", path: "a.txt" })).toContain(
      "not both",
    );
    expect(getToolInputValidationError("count_text", { text: "hello" })).toBeNull();
    expect(getToolInputValidationError("text_metrics", { path: "note.txt" })).toBeNull();
  });
});

describe("preflightValidateAndRepairToolInput", () => {
  it("repairs empty search_files query from context", () => {
    const result = preflightValidateAndRepairToolInput({
      toolName: "search_files",
      input: { path: "." },
      contextText: "Inspect connect4 engine and policy implementation details",
    });
    expect(result.error).toBeNull();
    expect(result.repaired).toBe(true);
    expect(result.input.query).toContain("connect4");
  });

  it("blocks search_files with empty query when no repair context is available", () => {
    const result = preflightValidateAndRepairToolInput({
      toolName: "search_files",
      input: { path: "." },
      contextText: "the and for to if then also",
    });
    expect(result.repaired).toBe(false);
    expect(result.repairable).toBe(false);
    expect(result.error).toContain("non-empty");
  });

  it("repairs read_file path from alternate filename field", () => {
    const result = preflightValidateAndRepairToolInput({
      toolName: "read_file",
      input: { filename: "README.md" },
    });
    expect(result.repaired).toBe(true);
    expect(result.error).toBeNull();
    expect(result.input.path).toBe("README.md");
  });
});

describe("tool failure normalization", () => {
  it("extracts message from structured error objects", () => {
    const result = {
      success: false,
      error: {
        kind: "runtime",
        message: "Variable x is not defined",
        display: "Traceback...",
      },
    };
    expect(getToolFailureReason(result, "unknown error")).toBe("Variable x is not defined");
  });

  it("falls back to display when structured message is absent", () => {
    const normalized = normalizeToolFailureReason(
      {
        success: false,
        error: {
          kind: "runtime",
          display: "Division by zero",
        },
      },
      "unknown error",
    );
    expect(normalized.message).toBe("Division by zero");
    expect(normalized.kind).toBe("runtime");
  });
});
