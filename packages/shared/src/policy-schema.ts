import { z } from "zod";
import { appTypes, approvedStatuses, policyActions, policyModes, riskLevels, sensitiveCategories } from "./constants";

const policyAction = z.enum(policyActions);
const dataCategory = z.enum(sensitiveCategories);
const customSensitiveTerms = z.preprocess((value) => {
  if (!Array.isArray(value)) return value;
  return value.map((item) => typeof item === "string" ? item : item?.name).filter(Boolean);
}, z.array(z.string().min(1).max(200)).max(200).default([]));

export const aiUsageGuardPolicySchema = z.object({
  policyId: z.string().min(1).max(255).optional(),
  policyName: z.string().min(1).max(160).optional(),
  policyVersion: z.string().min(1).max(80).optional(),
  enabled: z.boolean().default(true),
  mode: z.enum(policyModes).default("active"),
  defaultAction: policyAction.default("warn"),
  unknownGenAIAppAction: policyAction.default("block"),
  reportEvents: z.boolean().default(true),
  storeRawPrompt: z.literal(false).default(false),
  storeRawFileContent: z.literal(false).default(false),
  promptScanning: z.object({
    enabled: z.boolean().default(true),
    enabledCategories: z.array(dataCategory).default(["email", "phone", "government_id", "bank_account", "payment_card", "api_key", "password", "token", "private_key"])
  }).default({}),
  piiDetection: z.object({
    enabled: z.boolean().default(true)
  }).default({}),
  onPiiDetected: z.object({
    promptAction: policyAction.default("block"),
    fileUploadAction: policyAction.default("block")
  }).default({}),
  fileScanning: z.object({
    enabled: z.boolean().default(true),
    maxFileSizeToScanMB: z.number().int().min(1).max(250).default(25),
    supportedTypes: z.array(z.string().min(1).max(16)).max(50).default(["pdf", "docx", "xlsx", "csv", "txt", "json", "xml", "log", "png", "jpg", "jpeg", "webp"]),
    onUnsupportedFileType: policyAction.default("warn"),
    onFileTooLarge: policyAction.default("block"),
    onScanFailure: policyAction.default("block"),
    ocrEnabled: z.boolean().default(false)
  }).default({}),
  applications: z.array(z.object({
    appName: z.string().min(1).max(120),
    appType: z.enum(appTypes),
    domains: z.array(z.string().min(1).max(255)).default([]),
    executableNames: z.array(z.string().min(1).max(255)).default([]),
    instanceType: z.enum(["business", "enterprise", "personal", "unknown"]).default("unknown"),
    appStatus: z.enum(approvedStatuses).default("unknown"),
    piiHandling: policyAction.default("warn"),
    fileUploadHandling: policyAction.default("warn"),
    allowedDataCategories: z.array(dataCategory).default(["business_general"]),
    blockedDataCategories: z.array(dataCategory).default([])
  })).default([]),
  riskActions: z.object({
    low: policyAction.default("allow"),
    medium: policyAction.default("warn"),
    high: policyAction.default("block"),
    critical: policyAction.default("block")
  }).default({}),
  userOverride: z.object({
    enabled: z.boolean().default(false),
    allowForRiskLevels: z.array(z.enum(riskLevels)).default(["low", "medium"]),
    requireJustification: z.boolean().default(true)
  }).default({}),
  customSensitiveTerms,
  education: z.object({
    enabled: z.boolean().default(true),
    triggerAfterRiskEvents: z.number().int().min(1).max(100).default(3),
    lookbackDays: z.number().int().min(1).max(365).default(7)
  }).default({})
}).passthrough();

export type AiUsageGuardPolicy = z.infer<typeof aiUsageGuardPolicySchema>;
export type PolicyAction = z.infer<typeof policyAction>;

export const defaultPolicyJson = aiUsageGuardPolicySchema.parse({});

export function policyWithIdentity(policy: unknown, identity: { policyId: string; policyName: string; policyVersion: string }) {
  return aiUsageGuardPolicySchema.parse({ ...(policy as object), ...identity, storeRawPrompt: false, storeRawFileContent: false });
}
