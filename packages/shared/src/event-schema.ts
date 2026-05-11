import { z } from "zod";
import { actions, inputTypes, pluginEventTypes, riskLevels, sensitiveCategories } from "./constants";
import { assertNoForbiddenTelemetryFields } from "./privacy";

export const safeEventMetadataSchema = z.object({
  machineName: z.string().min(1).max(255).optional(),
  hostname: z.string().min(1).max(255).optional(),
  browserVersion: z.string().min(1).max(80).optional(),
  pluginVersion: z.string().min(1).max(80).optional(),
  userIdentifierHash: z.string().min(1).max(255).optional(),
  genAIApplication: z.string().min(1).max(120).optional(),
  genAIDomain: z.string().min(1).max(255).optional(),
  riskCategory: z.enum(sensitiveCategories).optional(),
  riskCategories: z.array(z.enum(sensitiveCategories)).max(50).optional(),
  riskLevel: z.union([z.enum(riskLevels), z.literal("none")]).optional(),
  actionTaken: z.enum(actions).optional(),
  policyId: z.string().max(255).optional(),
  policyName: z.string().min(1).max(160).optional(),
  policyVersion: z.string().max(120).optional(),
  policyMode: z.string().min(1).max(80).optional(),
  policyApplied: z.boolean().optional(),
  userOverride: z.boolean().optional(),
  userJustificationProvided: z.boolean().optional(),
  userJustification: z.string().min(1).max(1000).optional(),
  eventCount: z.number().int().min(0).max(1_000_000).optional(),
  promptEventCount: z.number().int().min(0).max(1_000_000).optional(),
  sensitivePromptAttemptCount: z.number().int().min(0).max(1_000_000).optional(),
  sensitiveFileUploadAttemptCount: z.number().int().min(0).max(1_000_000).optional(),
  blockedEventCount: z.number().int().min(0).max(1_000_000).optional(),
  warnedEventCount: z.number().int().min(0).max(1_000_000).optional(),
  categoryCounts: z.record(z.enum(sensitiveCategories), z.number().int().min(0).max(1_000_000)).optional(),
  detectedCategoryCounts: z.record(z.enum(sensitiveCategories), z.number().int().min(0).max(1_000_000)).optional(),
  fileType: z.string().min(1).max(32).optional(),
  fileSizeBucket: z.enum(["0-100KB", "100KB-1MB", "0-1MB", "1MB-5MB", "1-5MB", "5MB-25MB", "5-25MB", "25MB+"]).optional(),
  fileNameHash: z.string().min(12).max(128).optional(),
  fileHash: z.string().min(12).max(128).optional(),
  browser: z.string().min(1).max(80).optional(),
  extensionVersion: z.string().min(1).max(80).optional(),
  localAgentVersion: z.string().min(1).max(80).optional(),
  scanEngineVersion: z.string().min(1).max(80).optional(),
  scanStatus: z.string().min(1).max(80).optional(),
  scanFailureReason: z.string().min(1).max(255).optional(),
  pageTitleHash: z.string().min(12).max(128).optional(),
  urlPathHash: z.string().min(12).max(128).optional(),
  rawPromptCollected: z.literal(false).optional(),
  safePromptCollected: z.literal(false).optional(),
  rawFileCollected: z.literal(false).optional(),
  extractedTextCollected: z.literal(false).optional(),
  ocrTextCollected: z.literal(false).optional()
}).catchall(z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string()), z.record(z.unknown())]));

const metadataSchema = safeEventMetadataSchema
  .default({})
  .superRefine((value, ctx) => {
    const bytes = new TextEncoder().encode(JSON.stringify(value)).length;
    if (bytes > 16_384) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "metadata must be 16KB or smaller" });
    }
    try {
      assertNoForbiddenTelemetryFields(value);
    } catch (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: (error as Error).message });
    }
  });

export const eventIngestSchema = z.object({
  organizationId: z.string().min(1),
  deviceId: z.string().min(1).max(255),
  machineName: z.string().min(1).max(255).optional(),
  userIdentifierHash: z.string().min(1).max(255).optional(),
  browser: z.string().min(1).max(80).optional(),
  browserVersion: z.string().min(1).max(80).optional(),
  pluginVersion: z.string().min(1).max(80).optional(),
  genAIApplication: z.string().min(1).max(120),
  genAIDomain: z.string().min(1).max(255).optional(),
  executableName: z.string().min(1).max(255).optional(),
  eventType: z.enum(pluginEventTypes),
  inputType: z.enum(inputTypes),
  fileType: z.string().min(1).max(32).optional(),
  fileSizeBucket: z.enum(["0-100KB", "100KB-1MB", "0-1MB", "1MB-5MB", "1-5MB", "5MB-25MB", "5-25MB", "25MB+"]).optional(),
  fileNameHash: z.string().min(12).max(128).optional(),
  fileHash: z.string().min(12).max(128).optional(),
  riskLevel: z.union([z.enum(riskLevels), z.literal("none")]).optional().default("low"),
  detectedCategories: z.array(z.enum(sensitiveCategories)).max(50).default([]),
  detectedCategoryCounts: z.record(z.enum(sensitiveCategories), z.number().int().min(0).max(1_000_000)).optional(),
  actionTaken: z.enum(actions),
  policyId: z.string().optional(),
  policyName: z.string().max(160).optional(),
  policyVersion: z.string().optional(),
  policyMode: z.string().max(80).optional(),
  scanStatus: z.string().max(80).optional(),
  scanFailureReason: z.string().max(255).optional(),
  userOverride: z.boolean().optional(),
  userJustificationProvided: z.boolean().optional(),
  userJustification: z.string().min(1).max(1000).optional(),
  timestamp: z.string().datetime().optional(),
  metadata: metadataSchema
}).strict().superRefine((value, ctx) => {
  try {
    assertNoForbiddenTelemetryFields(value);
  } catch (error) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: (error as Error).message });
  }
});

export function normalizeGenAIAppName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, " ");
  const known: Record<string, string> = {
    chatgpt: "ChatGPT",
    "openai chatgpt": "ChatGPT",
    claude: "Claude",
    gemini: "Gemini",
    bard: "Gemini",
    perplexity: "Perplexity",
    grok: "Grok",
    copilot: "Microsoft Copilot",
    "microsoft copilot": "Microsoft Copilot"
  };
  return known[cleaned.toLowerCase()] ?? cleaned;
}
