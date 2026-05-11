import { describe, expect, it } from "vitest";
import { defaultPolicyJson, evaluatePolicy } from "@ai-usage-guard/shared";

const basePolicy = {
  ...defaultPolicyJson,
  mode: "active",
  unknownGenAIAppAction: "block",
  applications: [
    { appName: "ChatGPT", appType: "browser", domains: ["chatgpt.com"], instanceType: "personal", appStatus: "restricted", piiHandling: "block", fileUploadHandling: "block", allowedDataCategories: ["business_general"], blockedDataCategories: ["government_id", "bank_account", "payment_card", "api_key", "password", "token", "private_key"] },
    { appName: "Microsoft Copilot", appType: "browser_and_desktop", domains: ["copilot.microsoft.com"], instanceType: "enterprise", appStatus: "approved", piiHandling: "warn", fileUploadHandling: "warn", allowedDataCategories: ["business_general", "internal_low_risk"], blockedDataCategories: ["api_key", "password", "token", "private_key"] }
  ],
  riskActions: { low: "allow", medium: "warn", high: "block", critical: "block" },
  userOverride: { enabled: true, allowForRiskLevels: ["low", "medium"], requireJustification: true }
} as const;

describe("policy engine", () => {
  it("monitor mode allows but reports by preserving the reason", () => {
    const decision = evaluatePolicy(input("ChatGPT", "chatgpt.com", "high", ["government_id"]), { ...basePolicy, mode: "monitor" });
    expect(decision.action).toBe("allow");
    expect(decision.reason).toContain("Monitor mode");
  });

  it("passive mode warns instead of blocking", () => {
    expect(evaluatePolicy(input("ChatGPT", "chatgpt.com", "high", ["government_id"]), { ...basePolicy, mode: "passive" }).action).toBe("warn");
  });

  it("active mode blocks high risk", () => {
    expect(evaluatePolicy(input("ChatGPT", "chatgpt.com", "high", ["government_id"]), basePolicy).action).toBe("block");
  });

  it("unknown app action block works", () => {
    expect(evaluatePolicy(input("Mystery AI", "mystery.example", "medium", ["email"]), basePolicy).action).toBe("block");
  });

  it("allows clean prompts even when unknown app policy is block", () => {
    const decision = evaluatePolicy(input("Mystery AI", "mystery.example", "low", []), basePolicy);
    expect(decision.action).toBe("allow");
    expect(decision.reason).toBe("No sensitive data detected.");
  });

  it("uses onPiiDetected prompt action only after PII is detected", () => {
    const policy = { ...basePolicy, onPiiDetected: { promptAction: "warn", fileUploadAction: "block" } };
    expect(evaluatePolicy(input("ChatGPT", "chatgpt.com", "medium", ["email"]), policy).action).toBe("warn");
    expect(evaluatePolicy(input("ChatGPT", "chatgpt.com", "low", []), policy).action).toBe("allow");
  });

  it("ChatGPT personal blocks PII", () => {
    expect(evaluatePolicy(input("ChatGPT", "chatgpt.com", "medium", ["email"]), basePolicy).action).toBe("block");
  });

  it("Copilot enterprise warns PII", () => {
    const policy = { ...basePolicy, onPiiDetected: { promptAction: "warn", fileUploadAction: "warn" } };
    expect(evaluatePolicy({ ...input("Microsoft Copilot", "copilot.microsoft.com", "medium", ["email"]), instanceType: "enterprise" }, policy).action).toBe("warn");
  });

  it("critical secret blocks everywhere", () => {
    expect(evaluatePolicy(input("Microsoft Copilot", "copilot.microsoft.com", "critical", ["api_key"]), basePolicy).action).toBe("block");
  });

  it("user override is allowed only for configured risk levels", () => {
    expect(evaluatePolicy(input("Microsoft Copilot", "copilot.microsoft.com", "medium", ["email"]), basePolicy).allowUserOverride).toBe(true);
    expect(evaluatePolicy(input("ChatGPT", "chatgpt.com", "high", ["government_id"]), basePolicy).allowUserOverride).toBe(false);
  });

  it("clean file upload is allowed without popup-worthy action", () => {
    expect(evaluatePolicy({ ...input("ChatGPT", "chatgpt.com", "low", []), inputType: "file_upload" }, basePolicy).action).toBe("allow");
  });

  it("file scan failure follows onScanFailure", () => {
    const decision = evaluatePolicy({ ...input("ChatGPT", "chatgpt.com", "low", []), inputType: "file_upload", scanStatus: "failed" }, basePolicy);
    expect(decision.action).toBe("block");
  });

  it("unsupported file follows onUnsupportedFileType", () => {
    const policy = { ...basePolicy, fileScanning: { ...basePolicy.fileScanning, onUnsupportedFileType: "warn" } };
    const decision = evaluatePolicy({ ...input("ChatGPT", "chatgpt.com", "low", []), inputType: "file_upload", scanStatus: "unsupported" }, policy);
    expect(decision.action).toBe("warn");
  });
});

function input(genAIApplication: string, genAIDomain: string, riskLevel: "low" | "medium" | "high" | "critical", detectedCategories: string[]) {
  return { genAIApplication, genAIDomain, instanceType: "personal" as const, inputType: "prompt" as const, riskLevel, detectedCategories, fileType: null };
}
