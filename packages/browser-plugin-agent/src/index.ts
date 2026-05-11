import { ApiHttpClient } from "./client";
import { EndpointClient } from "./endpoint-client";
import { EventClient } from "./event-client";
import { PolicyClient } from "./policy-client";
import type { BrowserAgentConfig, PolicyStatusPayload } from "./types";

export class AIUsageGuardBrowserAgent {
  private readonly http: ApiHttpClient;
  private readonly endpointClient: EndpointClient;
  private readonly policyClient: PolicyClient;
  private readonly eventClient: EventClient;

  constructor(private readonly config: BrowserAgentConfig) {
    this.http = new ApiHttpClient(config);
    this.endpointClient = new EndpointClient(config, this.http, config.storage);
    this.policyClient = new PolicyClient(config, this.http, config.storage);
    this.eventClient = new EventClient(config, this.http, config.storage);
  }

  checkIn(payload = {}) {
    return this.endpointClient.checkInEndpoint(payload);
  }

  checkInEndpoint(payload = {}) {
    return this.endpointClient.checkInEndpoint(payload);
  }

  getPolicy() {
    return this.policyClient.getLatestPolicy();
  }

  getLatestPolicy() {
    return this.policyClient.getLatestPolicy();
  }

  getCachedPolicy() {
    return this.policyClient.getCachedPolicy();
  }

  reportPolicyStatus(payload: Omit<PolicyStatusPayload, "deviceId"> & Partial<Pick<PolicyStatusPayload, "deviceId">>) {
    return this.endpointClient.reportPolicyStatus(payload);
  }

  reportGenAIUsage(payload: Parameters<EventClient["reportGenAIUsage"]>[0]) {
    return this.eventClient.reportGenAIUsage(payload);
  }

  reportSensitivePromptEvent(payload: Parameters<EventClient["reportSensitivePromptEvent"]>[0]) {
    return this.eventClient.reportSensitivePromptEvent(payload);
  }

  reportSensitiveFileUploadEvent(payload: Parameters<EventClient["reportSensitiveFileUploadEvent"]>[0]) {
    return this.eventClient.reportSensitiveFileUploadEvent(payload);
  }

  flushQueue() {
    return this.eventClient.flushQueue();
  }
}

export * from "./client";
export * from "./endpoint-client";
export * from "./event-client";
export * from "./policy-client";
export * from "./queue";
export * from "./storage-adapter";
export * from "./types";
export * from "./validators";
export * from "./errors";
