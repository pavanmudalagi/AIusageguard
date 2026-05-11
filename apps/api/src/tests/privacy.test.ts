import { describe, expect, it } from "vitest";
import { aiUsageGuardPolicySchema, eventIngestSchema } from "@ai-usage-guard/shared";

describe("privacy validation", () => {
  it("rejects raw prompt telemetry fields", () => {
    expect(() => eventIngestSchema.parse({
      organizationId: "org_123",
      deviceId: "device_abc",
      genAIApplication: "ChatGPT",
      eventType: "sensitive_prompt_detected",
      inputType: "prompt",
      riskLevel: "high",
      detectedCategories: ["email"],
      actionTaken: "blocked",
      rawPrompt: "do not store this"
    })).toThrow();
  });

  it("rejects policy raw collection enablement", () => {
    expect(() => aiUsageGuardPolicySchema.parse({
      storeRawPrompt: true,
      storeRawFileContent: false
    })).toThrow();
  });
});
