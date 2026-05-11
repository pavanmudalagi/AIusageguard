import type { BrowserAgentConfig, BrowserEventPayload, HttpClient, QueueConfig, StorageAdapter } from "./types";
import { OfflineEventQueue } from "./queue";
import { safeWarn, validateSafeEvent } from "./validators";

const defaultQueueConfig: QueueConfig = {
  enabled: true,
  maxEvents: 500,
  retryIntervalSeconds: 60,
  maxRetryAttempts: 10
};

export class EventClient {
  readonly queue: OfflineEventQueue;
  private readonly queueConfig: QueueConfig;

  constructor(
    private readonly config: BrowserAgentConfig,
    private readonly http: HttpClient,
    storage: StorageAdapter
  ) {
    this.queueConfig = { ...defaultQueueConfig, ...config.queue };
    this.queue = new OfflineEventQueue(storage, this.queueConfig);
  }

  async reportGenAIUsage(payload: Omit<BrowserEventPayload, "organizationId" | "deviceId" | "eventType" | "inputType" | "riskLevel" | "detectedCategories" | "actionTaken"> & Partial<BrowserEventPayload>): Promise<void> {
    await this.sendEvent({
      organizationId: this.config.organizationId,
      deviceId: this.config.deviceId,
      eventType: "genai_app_used",
      inputType: "browser",
      riskLevel: "low",
      detectedCategories: [],
      actionTaken: "allowed",
      ...payload
    } as BrowserEventPayload);
  }

  async reportSensitivePromptEvent(payload: Omit<BrowserEventPayload, "organizationId" | "deviceId" | "eventType" | "inputType"> & Partial<Pick<BrowserEventPayload, "organizationId" | "deviceId">>): Promise<void> {
    await this.sendEvent({
      organizationId: this.config.organizationId,
      deviceId: this.config.deviceId,
      eventType: "sensitive_prompt_detected",
      inputType: "prompt",
      ...payload
    } as BrowserEventPayload);
  }

  async reportSensitiveFileUploadEvent(payload: Omit<BrowserEventPayload, "organizationId" | "deviceId" | "eventType" | "inputType"> & Partial<Pick<BrowserEventPayload, "organizationId" | "deviceId">>): Promise<void> {
    await this.sendEvent({
      organizationId: this.config.organizationId,
      deviceId: this.config.deviceId,
      eventType: "sensitive_file_upload_detected",
      inputType: "file_upload",
      ...payload
    } as BrowserEventPayload);
  }

  async flushQueue(): Promise<{ delivered: number; remaining: number }> {
    return this.queue.flush((payload) => this.deliver(payload));
  }

  private async sendEvent(payload: BrowserEventPayload): Promise<void> {
    const enrichedPayload = enrichSafeMetadata(payload, this.config.hostname);
    let safePayload: BrowserEventPayload;
    try {
      safePayload = validateSafeEvent(enrichedPayload);
    } catch (error) {
      safeWarn(this.config.logger ?? console, error);
      throw error;
    }

    try {
      await this.deliver(safePayload);
    } catch (error) {
      if (!this.queueConfig.enabled) throw error;
      await this.queue.enqueue(safePayload);
    }
  }

  private async deliver(payload: BrowserEventPayload): Promise<void> {
    await this.http.post("/api/v1/events", payload);
  }
}

function enrichSafeMetadata(payload: BrowserEventPayload, machineName?: string): BrowserEventPayload {
  const categoryCounts = payload.detectedCategories.reduce<Record<string, number>>((counts, category) => {
    counts[category] = (counts[category] ?? 0) + 1;
    return counts;
  }, {});

  const metadata: Record<string, unknown> = omitUndefined({
    machineName,
    userIdentifierHash: payload.userIdentifierHash,
    genAIApplication: payload.genAIApplication,
    genAIDomain: payload.genAIDomain,
    riskCategory: payload.detectedCategories[0],
    riskCategories: payload.detectedCategories,
    riskLevel: payload.riskLevel,
    actionTaken: payload.actionTaken,
    policyId: payload.policyId,
    policyVersion: payload.policyVersion,
    policyApplied: payload.eventType === "policy_applied" ? true : undefined,
    eventCount: 1,
    promptEventCount: payload.inputType === "prompt" ? 1 : 0,
    sensitivePromptAttemptCount: payload.eventType === "sensitive_prompt_detected" ? 1 : 0,
    sensitiveFileUploadAttemptCount: payload.eventType === "sensitive_file_upload_detected" ? 1 : 0,
    blockedEventCount: payload.actionTaken === "blocked" ? 1 : 0,
    warnedEventCount: payload.actionTaken === "warned" ? 1 : 0,
    categoryCounts,
    fileType: payload.fileType,
    fileSizeBucket: payload.fileSizeBucket,
    fileHash: payload.fileHash,
    ...payload.metadata
  });

  return {
    ...payload,
    metadata: metadata as BrowserEventPayload["metadata"]
  };
}

function omitUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
