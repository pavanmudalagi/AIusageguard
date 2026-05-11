import type { EventIngest, PolicyJson } from "@ai-usage-guard/shared";

export interface StorageAdapter {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface QueueConfig {
  enabled: boolean;
  maxEvents: number;
  retryIntervalSeconds: number;
  maxRetryAttempts: number;
}

export interface BrowserAgentConfig {
  baseUrl: string;
  organizationId: string;
  enrollmentToken: string;
  deviceId: string;
  hostname?: string;
  osVersion?: string;
  browserExtensionVersion?: string;
  storage: StorageAdapter;
  queue?: Partial<QueueConfig>;
  fetchImpl?: typeof fetch;
  logger?: Pick<Console, "warn" | "info">;
}

export interface EndpointCheckInPayload {
  organizationId: string;
  deviceId: string;
  hostname: string;
  os: "browser";
  osVersion?: string;
  browserExtensionVersion?: string;
  currentPolicyId?: string;
  currentPolicyVersion?: string;
}

export interface EndpointPolicy {
  policyId: string;
  policyVersion: string;
  policyJson: PolicyJson;
}

export interface CheckInResponse {
  endpointId: string;
  serverTime: string;
  policy: EndpointPolicy | null;
}

export interface PolicyStatusPayload {
  deviceId: string;
  policyId: string;
  policyVersion: string;
  status: "delivered" | "applied" | "failed";
  errorMessage?: string | null;
}

export type BrowserEventPayload = EventIngest;

export interface QueuedEvent {
  id: string;
  payload: BrowserEventPayload;
  attempts: number;
  nextAttemptAt: number;
  createdAt: number;
}

export interface HttpClient {
  post<TResponse>(path: string, body: unknown): Promise<TResponse>;
}
