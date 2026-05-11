import { describe, expect, it } from "vitest";
import { AIUsageGuardBrowserAgent, ForbiddenRawContentError, MetadataTooLargeError } from "../src";
import { baseEvent, config, createFetchMock } from "./test-utils";

describe("event client", () => {
  it("reports GenAI usage metadata", async () => {
    const fetchMock = createFetchMock();
    const client = new AIUsageGuardBrowserAgent(config(fetchMock));
    await client.reportGenAIUsage({
      genAIApplication: "ChatGPT",
      genAIDomain: "chatgpt.com",
      userIdentifierHash: "hash_user_123",
      policyId: "pol_456",
      policyVersion: "2026.05.07.002",
      metadata: { browser: "chrome", extensionVersion: "0.6.0" }
    });
    expect(fetchMock.calls[0].body).toMatchObject({ eventType: "genai_app_used", inputType: "browser", riskLevel: "low", actionTaken: "allowed" });
    expect(fetchMock.calls[0].body).toMatchObject({
      metadata: {
        machineName: "browser-extension-host",
        userIdentifierHash: "hash_user_123",
        genAIApplication: "ChatGPT",
        genAIDomain: "chatgpt.com",
        eventCount: 1,
        blockedEventCount: 0
      }
    });
  });

  it("reports sensitive prompt events without raw prompt data", async () => {
    const fetchMock = createFetchMock();
    const client = new AIUsageGuardBrowserAgent(config(fetchMock));
    await client.reportSensitivePromptEvent({ ...baseEvent, metadata: { rawPromptCollected: false, scanEngineVersion: "0.6.0" } });
    expect(fetchMock.calls[0].body).toMatchObject({ eventType: "sensitive_prompt_detected", inputType: "prompt" });
    expect(fetchMock.calls[0].body).toMatchObject({
      metadata: {
        machineName: "browser-extension-host",
        riskCategory: "email",
        riskLevel: "high",
        actionTaken: "blocked",
        policyId: "pol_456",
        policyVersion: "2026.05.07.002",
        sensitivePromptAttemptCount: 1,
        categoryCounts: { email: 1 }
      }
    });
    expect(JSON.stringify(fetchMock.calls[0].body)).not.toContain("promptText");
  });

  it("reports sensitive file upload events without file content", async () => {
    const fetchMock = createFetchMock();
    const client = new AIUsageGuardBrowserAgent(config(fetchMock));
    await client.reportSensitiveFileUploadEvent({
      ...baseEvent,
      genAIApplication: "Claude",
      genAIDomain: "claude.ai",
      fileType: "pdf",
      fileSizeBucket: "1MB-5MB",
      fileHash: "sha256_hash_optional",
      metadata: { rawFileCollected: false, scanEngineVersion: "0.6.0" }
    });
    expect(fetchMock.calls[0].body).toMatchObject({ eventType: "sensitive_file_upload_detected", inputType: "file_upload", fileType: "pdf" });
    expect(fetchMock.calls[0].body).toMatchObject({
      metadata: {
        fileType: "pdf",
        fileSizeBucket: "1MB-5MB",
        fileHash: "sha256_hash_optional",
        sensitiveFileUploadAttemptCount: 1,
        rawFileCollected: false
      }
    });
  });

  it("rejects forbidden raw content fields before delivery", async () => {
    const fetchMock = createFetchMock();
    const client = new AIUsageGuardBrowserAgent(config(fetchMock));
    await expect(client.reportSensitivePromptEvent({ ...baseEvent, metadata: { promptText: "secret" } })).rejects.toBeInstanceOf(ForbiddenRawContentError);
    expect(fetchMock.calls).toHaveLength(0);
  });

  it("enforces metadata size limits", async () => {
    const fetchMock = createFetchMock();
    const client = new AIUsageGuardBrowserAgent(config(fetchMock));
    await expect(client.reportSensitivePromptEvent({ ...baseEvent, metadata: { summary: "x".repeat(17_000) } })).rejects.toBeInstanceOf(MetadataTooLargeError);
    expect(fetchMock.calls).toHaveLength(0);
  });
});
