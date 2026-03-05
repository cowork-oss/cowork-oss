import { describe, expect, it } from "vitest";

import { sanitizeInputRequestRespondParams } from "../control-plane-methods";

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }
  return String(error ?? "");
}

describe("control-plane input request response sanitization", () => {
  it("accepts valid payload and trims answer strings", () => {
    const sanitized = sanitizeInputRequestRespondParams({
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      status: "submitted",
      answers: {
        delivery_mode: {
          optionLabel: " Desktop + API (Recommended) ",
          otherText: " Ship both surfaces ",
        },
      },
    });

    expect(sanitized).toEqual({
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      status: "submitted",
      answers: {
        delivery_mode: {
          optionLabel: "Desktop + API (Recommended)",
          otherText: "Ship both surfaces",
        },
      },
    });
  });

  it("rejects non-UUID request ids", () => {
    try {
      sanitizeInputRequestRespondParams({
        requestId: "not-a-uuid",
        status: "submitted",
      });
      throw new Error("Expected sanitizeInputRequestRespondParams to throw");
    } catch (error: unknown) {
      expect(getErrorMessage(error)).toMatch(/requestId must be a UUID/i);
    }
  });

  it("rejects non-snake-case answer keys", () => {
    try {
      sanitizeInputRequestRespondParams({
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        status: "submitted",
        answers: {
          NotSnakeCase: { optionLabel: "A" },
        },
      });
      throw new Error("Expected sanitizeInputRequestRespondParams to throw");
    } catch (error: unknown) {
      expect(getErrorMessage(error)).toMatch(/must match/i);
    }
  });

  it("rejects invalid answer value shapes", () => {
    try {
      sanitizeInputRequestRespondParams({
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        status: "submitted",
        answers: {
          delivery_mode: "desktop",
        },
      });
      throw new Error("Expected sanitizeInputRequestRespondParams to throw");
    } catch (error: unknown) {
      expect(getErrorMessage(error)).toMatch(/must be an object/i);
    }
  });
});
