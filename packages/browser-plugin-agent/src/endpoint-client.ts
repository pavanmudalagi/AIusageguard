import type { BrowserAgentConfig, CheckInResponse, EndpointCheckInPayload, HttpClient, PolicyStatusPayload, StorageAdapter } from "./types";

export const POLICY_CACHE_KEY = "aiug.latestPolicy";

export class EndpointClient {
  constructor(
    private readonly config: BrowserAgentConfig,
    private readonly http: HttpClient,
    private readonly storage: StorageAdapter
  ) {}

  async checkInEndpoint(payload?: Partial<EndpointCheckInPayload>): Promise<CheckInResponse> {
    const cachedPolicy = await this.storage.getItem<CheckInResponse["policy"]>(POLICY_CACHE_KEY);
    const body: EndpointCheckInPayload = {
      organizationId: this.config.organizationId,
      deviceId: this.config.deviceId,
      hostname: this.config.hostname ?? "browser-extension-host",
      os: "browser",
      osVersion: this.config.osVersion ?? "chrome",
      browserExtensionVersion: this.config.browserExtensionVersion,
      currentPolicyId: cachedPolicy?.policyId,
      currentPolicyVersion: cachedPolicy?.policyVersion,
      ...payload
    };
    const response = await this.http.post<CheckInResponse>("/api/v1/endpoints/check-in", body);
    if (response.policy) {
      await this.storage.setItem(POLICY_CACHE_KEY, response.policy);
    }
    return response;
  }

  async reportPolicyStatus(payload: Omit<PolicyStatusPayload, "deviceId"> & Partial<Pick<PolicyStatusPayload, "deviceId">>): Promise<void> {
    await this.http.post("/api/v1/endpoints/policy-status", {
      deviceId: this.config.deviceId,
      ...payload
    });
  }
}
