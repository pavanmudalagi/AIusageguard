import { describe, expect, it } from "vitest";
import { AIUsageGuardBrowserAgent, MemoryStorageAdapter, OfflineEventQueue } from "../src";
import { baseEvent, config, createFetchMock } from "./test-utils";

describe("offline queue and storage", () => {
  it("stores and retrieves values with memory storage", async () => {
    const storage = new MemoryStorageAdapter();
    await storage.setItem("key", { ok: true });
    await expect(storage.getItem("key")).resolves.toEqual({ ok: true });
    await storage.removeItem("key");
    await expect(storage.getItem("key")).resolves.toBeNull();
  });

  it("queues events when delivery fails and flushes later", async () => {
    const fetchMock = createFetchMock([
      { ok: false, status: 503, body: { error: "offline" } },
      { ok: true, status: 201, body: { eventId: "evt_1" } }
    ]);
    const cfg = config(fetchMock);
    const client = new AIUsageGuardBrowserAgent({ ...cfg, queue: { retryIntervalSeconds: 0 } });
    await client.reportSensitivePromptEvent(baseEvent);
    await expect(cfg.storage.getItem<any[]>("aiug.eventQueue")).resolves.toHaveLength(1);
    const result = await client.flushQueue();
    expect(result).toEqual({ delivered: 1, remaining: 0 });
  });

  it("drops oldest events beyond max queue size", async () => {
    const storage = new MemoryStorageAdapter();
    const queue = new OfflineEventQueue(storage, { enabled: true, maxEvents: 2, retryIntervalSeconds: 0, maxRetryAttempts: 2 });
    await queue.enqueue({ organizationId: "org", deviceId: "d1", eventType: "genai_app_used", inputType: "browser", genAIApplication: "ChatGPT", riskLevel: "low", detectedCategories: [], actionTaken: "allowed", metadata: {} });
    await queue.enqueue({ organizationId: "org", deviceId: "d1", eventType: "genai_app_used", inputType: "browser", genAIApplication: "Claude", riskLevel: "low", detectedCategories: [], actionTaken: "allowed", metadata: {} });
    await queue.enqueue({ organizationId: "org", deviceId: "d1", eventType: "genai_app_used", inputType: "browser", genAIApplication: "Gemini", riskLevel: "low", detectedCategories: [], actionTaken: "allowed", metadata: {} });
    expect(await queue.size()).toBe(2);
    const items = await queue.read();
    expect(items[0].payload.genAIApplication).toBe("Claude");
  });
});
