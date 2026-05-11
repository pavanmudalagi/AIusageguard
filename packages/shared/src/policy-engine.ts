import type { AiUsageGuardPolicy, PolicyAction } from "./policy-schema";
import { aiUsageGuardPolicySchema } from "./policy-schema";

type RiskLevel = "low" | "medium" | "high" | "critical";

export type PolicyEvaluationInput = {
  genAIApplication: string;
  genAIDomain?: string | null;
  instanceType?: "business" | "enterprise" | "personal" | "unknown" | null;
  inputType: "prompt" | "file_upload" | "app_usage" | "policy";
  riskLevel: RiskLevel;
  detectedCategories: string[];
  fileType?: string | null;
  fileSizeMB?: number | null;
  scanStatus?: string | null;
};

export type PolicyEvaluationResult = {
  action: PolicyAction;
  reason: string;
  allowUserOverride: boolean;
  requiresJustification: boolean;
  matchedRule: { type: "disabled" | "unknown_app" | "application" | "risk" | "file" | "default"; appName?: string };
};

const actionRank: Record<PolicyAction, number> = { allow: 0, redact: 1, warn: 2, block: 3 };
const secretCategories = new Set(["api_key", "access_token", "secret_key", "password", "token", "private_key", "database_connection"]);

export function evaluatePolicy(input: PolicyEvaluationInput, candidatePolicy: unknown): PolicyEvaluationResult {
  const policy = aiUsageGuardPolicySchema.parse(candidatePolicy);
  if (!policy.enabled) return result("allow", "Policy is disabled.", policy, input.riskLevel, { type: "disabled" });

  if (input.inputType === "file_upload") {
    const fileDecision = filePreflightAction(input, policy);
    if (fileDecision) return withMode(fileDecision.action, fileDecision.reason, policy, input.riskLevel, { type: "file" });
  }
  if (!policy.piiDetection.enabled || input.detectedCategories.length === 0) {
    return result("allow", input.inputType === "file_upload" ? "No sensitive data detected in attached file." : "No sensitive data detected.", policy, "low", { type: "default" });
  }

  const appRule = findApplicationRule(input, policy);
  if (!appRule) {
    return withMode(policy.unknownGenAIAppAction, `Unknown GenAI app uses policy action ${policy.unknownGenAIAppAction}.`, policy, input.riskLevel, { type: "unknown_app" });
  }

  const appAction = input.inputType === "file_upload"
    ? policy.onPiiDetected.fileUploadAction ?? appRule.fileUploadHandling
    : policy.onPiiDetected.promptAction ?? appRule.piiHandling;
  const categoryAction = categoryDecision(input.detectedCategories, appRule, appAction);
  const riskAction = policy.riskActions[input.riskLevel] ?? policy.defaultAction;
  const secretAction = input.detectedCategories.some((category) => secretCategories.has(category)) ? "block" : "allow";
  const finalAction = strictest(appAction, categoryAction, riskAction, secretAction);

  return withMode(
    finalAction,
    `${appRule.appName} ${input.inputType === "file_upload" ? "file upload" : "PII"} handling resolved to ${finalAction}.`,
    policy,
    input.riskLevel,
    { type: "application", appName: appRule.appName }
  );
}

function findApplicationRule(input: PolicyEvaluationInput, policy: AiUsageGuardPolicy) {
  const appName = input.genAIApplication.toLowerCase();
  const domain = input.genAIDomain?.toLowerCase() ?? "";
  const instanceType = input.instanceType ?? "unknown";
  return policy.applications.find((rule) => {
    const nameMatches = rule.appName.toLowerCase() === appName;
    const domainMatches = domain && rule.domains.some((candidate) => domain === candidate.toLowerCase() || domain.endsWith(`.${candidate.toLowerCase()}`));
    const instanceMatches = rule.instanceType === "unknown" || rule.instanceType === instanceType;
    return instanceMatches && (nameMatches || domainMatches);
  });
}

function filePreflightAction(input: PolicyEvaluationInput, policy: AiUsageGuardPolicy) {
  if (!policy.fileScanning.enabled) return { action: policy.defaultAction, reason: "File scanning is disabled." };
  if (input.fileSizeMB && input.fileSizeMB > policy.fileScanning.maxFileSizeToScanMB) return { action: policy.fileScanning.onFileTooLarge, reason: "File is too large for local scanning." };
  if (input.scanStatus === "unsupported") return { action: policy.fileScanning.onUnsupportedFileType, reason: "File type is not supported for local scanning." };
  if (input.scanStatus === "failed") return { action: policy.fileScanning.onScanFailure, reason: "File scan failed." };
  return null;
}

function categoryDecision(categories: string[], appRule: AiUsageGuardPolicy["applications"][number], fallbackAction: PolicyAction): PolicyAction {
  const blocked = categories.some((category) => appRule.blockedDataCategories.includes(category as never));
  const allowedOnly = categories.length > 0 && categories.every((category) => appRule.allowedDataCategories.includes(category as never));
  if (blocked) return "block";
  if (allowedOnly) return "allow";
  return fallbackAction;
}

function strictest(...actions: PolicyAction[]): PolicyAction {
  return actions.reduce((selected, action) => (actionRank[action] > actionRank[selected] ? action : selected), "allow");
}

function withMode(action: PolicyAction, reason: string, policy: AiUsageGuardPolicy, riskLevel: RiskLevel, matchedRule: PolicyEvaluationResult["matchedRule"]) {
  const modeAction = policy.mode === "monitor" ? "allow" : policy.mode === "passive" && action === "block" ? "warn" : action;
  return result(modeAction, policy.mode === "monitor" ? `${reason} Monitor mode reports only.` : policy.mode === "passive" && action === "block" ? `${reason} Passive mode warns instead of blocking.` : reason, policy, riskLevel, matchedRule);
}

function result(action: PolicyAction, reason: string, policy: AiUsageGuardPolicy, riskLevel: RiskLevel, matchedRule: PolicyEvaluationResult["matchedRule"]): PolicyEvaluationResult {
  return {
    action,
    reason,
    allowUserOverride: action !== "allow" && policy.userOverride.enabled && policy.userOverride.allowForRiskLevels.includes(riskLevel),
    requiresJustification: policy.userOverride.requireJustification,
    matchedRule
  };
}
