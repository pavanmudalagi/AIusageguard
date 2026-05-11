import { vi } from "vitest";
import type { BrowserAgentConfig } from "../src/types";
import { MemoryStorageAdapter } from "../src/storage-adapter";

export function createFetchMock(responses: Array<{ ok?: boolean; status?: number; body?: unknown }> = []) {
  const calls: Array<{ url: string; body: unknown; headers: HeadersInit | undefined }> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: init?.headers
    });
    const response = responses.shift() ?? { ok: true, status: 200, body: { ok: true } };
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.body ?? { ok: true }
    } as Response;
  }) as unknown as typeof fetch & { mock: ReturnType<typeof vi.fn>["mock"]; calls: typeof calls };
  fetchMock.calls = calls;
  return fetchMock;
}

export function config(fetchImpl = createFetchMock()): BrowserAgentConfig {
  return {
    baseUrl: "http://localhost:4000",
    organizationId: "org_123",
    enrollmentToken: "token_value",
    deviceId: "device_abc",
    hostname: "browser-extension-host",
    browserExtensionVersion: "0.6.0",
    storage: new MemoryStorageAdapter(),
    fetchImpl,
    logger: { warn: vi.fn(), info: vi.fn() }
  };
}

export const baseEvent = {
  userIdentifierHash: "hash_user_123",
  genAIApplication: "ChatGPT",
  genAIDomain: "chatgpt.com",
  riskLevel: "high" as const,
  detectedCategories: ["email" as const],
  actionTaken: "blocked" as const,
  policyId: "pol_456",
  policyVersion: "2026.05.07.002",
  metadata: { scanEngineVersion: "0.6.0" }
};
