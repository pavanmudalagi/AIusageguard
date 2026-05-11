import type { sensitiveCategories } from "@ai-usage-guard/shared";

export type SensitiveCategory = typeof sensitiveCategories[number];
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type Confidence = "low" | "medium" | "high";
export type PolicyAction = "allow" | "warn" | "redact" | "block" | "require_justification";

export interface ScannerFinding {
  category: SensitiveCategory;
  label: string;
  country?: string;
  riskLevel: RiskLevel;
  confidence: Confidence;
  count: number;
  ranges?: Array<{ start: number; end: number; placeholder: string }>;
}

export interface ScanResult {
  hasSensitiveData: boolean;
  riskLevel: RiskLevel;
  findings: ScannerFinding[];
  categoryCounts: Partial<Record<SensitiveCategory, number>>;
  redactedText: string;
}

export interface CustomSensitiveTerm {
  name: string;
  pattern?: string;
  contextKeywords?: string[];
  riskLevel?: RiskLevel;
}

export interface ScannerOptions {
  enabledCategories?: SensitiveCategory[];
  customTerms?: CustomSensitiveTerm[];
  contextWindow?: number;
}

export interface Rule {
  id: string;
  category: SensitiveCategory;
  label: string;
  riskLevel: RiskLevel;
  confidence: Confidence;
  country?: string;
  pattern: RegExp;
  placeholder: string;
  context?: string[];
  validator?: (value: string, context: string) => boolean;
}

export interface FileScanInput {
  name: string;
  type?: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface FileScanPolicy {
  enabled: boolean;
  maxFileSizeToScanMB: number;
  supportedTypes: string[];
  onUnsupportedFileType: PolicyAction;
  onFileTooLarge: PolicyAction;
  onScanFailure: PolicyAction;
  ocrEnabled?: boolean;
}

export interface FileScanResult extends ScanResult {
  fileType: string;
  fileSizeBucket: string;
  scanStatus: "scanned" | "unsupported_file_type" | "file_too_large" | "scan_failed" | "ocr_not_implemented";
  scanFailureReason?: string;
  actionOnFailure?: PolicyAction;
}

export interface PolicyEvaluationInput {
  genAIApplication: string;
  genAIDomain?: string;
  instanceType?: "personal" | "business" | "unknown";
  inputType: "prompt" | "file_upload";
  riskLevel: RiskLevel;
  detectedCategories: SensitiveCategory[];
  fileType?: string | null;
  policy: any;
}

export interface PolicyEvaluationOutput {
  action: PolicyAction;
  reason: string;
  allowUserOverride: boolean;
  requiresJustification: boolean;
}
