import { describe, expect, it } from "vitest";
import { AIUsageGuardBrowserAgent } from "../src";
import { POLICY_CACHE_KEY } from "../src/endpoint-client";
import { config, createFetchMock } from "./test-utils";

describe("policy and endpoint client", () => {
  it("sends the expected check-in request and caches policy", async () => {
    const policy = {
      policyId: "pol_456",
      policyVersion: "2026.05.07.002",
      policyJson: { enabled: true, mode: "active", defaultAction: "warn", unknownGenAIAppAction: "block", reportEvents: true, storeRawPrompt: false, storeRawFileContent: false }
    };
    const fetchMock = createFetchMock([{ body: { endpointId: "endpoint_123", serverTime: "2026-05-07T10:30:00Z", policy } }]);
    const cfg = config(fetchMock);
    const client = new AIUsageGuardBrowserAgent(cfg);

    const response = await client.checkIn();

    expect(response.policy?.policyId).toBe("pol_456");
    expect(fetchMock.calls[0].url).toBe("http://localhost:4000/api/v1/endpoints/check-in");
    expect(fetchMock.calls[0].body).toMatchObject({
      organizationId: "org_123",
      deviceId: "device_abc",
      hostname: "browser-extension-host",
      os: "browser",
      browserExtensionVersion: "0.6.0"
    });
    await expect(cfg.storage.getItem(POLICY_CACHE_KEY)).resolves.toMatchObject({ policyId: "pol_456" });
  });

  it("reports policy status", async () => {
    const fetchMock = createFetchMock();
    const client = new AIUsageGuardBrowserAgent(config(fetchMock));
    await client.reportPolicyStatus({ policyId: "pol_456", policyVersion: "2026.05.07.002", status: "applied", errorMessage: null });
    expect(fetchMock.calls[0].url).toBe("http://localhost:4000/api/v1/endpoints/policy-status");
    expect(fetchMock.calls[0].body).toMatchObject({ deviceId: "device_abc", status: "applied" });
  });
});
