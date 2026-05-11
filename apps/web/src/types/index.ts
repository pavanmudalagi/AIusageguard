export interface OverviewMetrics {
  aiToolsUsed: number;
  protectedEndpoints: number;
  sensitivePromptAttempts: number;
  sensitiveFileUploadAttempts: number;
  blockedEvents: number;
  warnedEvents: number;
  highCriticalRiskEvents: number;
  policyCoveragePercent: number;
  totalGenAIAppsDetected?: number;
  totalPromptsScanned?: number;
  safePromptReplacements?: number;
  filesScanned?: number;
  sensitiveFilesDetected?: number;
  fileUploadsBlocked?: number;
  unknownAIAppsDetected?: number;
  pendingQueuedEvents?: number;
}

export interface EndpointAiUsageRow {
  endpointId: string;
  machineName: string;
  userDisplay: string;
  operatingSystem: string;
  genAIApplicationId: string | null;
  genAIApplicationName: string;
  appType: string;
  usageCount: number;
  piiAttemptCount: number;
  sensitiveFileUploadCount: number;
  lastUsedAt: string;
  currentPolicyId: string | null;
  currentPolicyName: string;
  policyMode: string;
  policyStatus: string;
}

export interface ApiList<T> {
  items: T[];
  total?: number;
  page?: number;
  pageSize?: number;
}
