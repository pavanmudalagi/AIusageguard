import { AIUsageGuardBrowserAgent, MemoryStorageAdapter } from "@ai-usage-guard/browser-plugin-agent";

const client = new AIUsageGuardBrowserAgent({
  baseUrl: process.env.API_BASE_URL ?? "http://localhost:4000",
  organizationId: process.env.ORGANIZATION_ID ?? "org_acme_dental",
  enrollmentToken: process.env.ENROLLMENT_TOKEN ?? "demo-enrollment-token",
  deviceId: process.env.DEVICE_ID ?? "browser_demo_device_001",
  hostname: "browser-extension-host",
  osVersion: "chrome",
  browserExtensionVersion: "0.6.0",
  storage: new MemoryStorageAdapter()
});

const checkIn = await client.checkIn();
console.log("Checked in:", checkIn.endpointId);

const policy = await client.getPolicy();
console.log("Policy:", policy?.policyId ?? "none");

await client.reportGenAIUsage({
  userIdentifierHash: "hash_browser_demo_user",
  genAIApplication: "ChatGPT",
  genAIDomain: "chatgpt.com",
  policyId: policy?.policyId,
  policyVersion: policy?.policyVersion,
  metadata: { browser: "chrome", extensionVersion: "0.6.0" }
});
console.log("Reported GenAI usage.");

await client.reportSensitivePromptEvent({
  userIdentifierHash: "hash_browser_demo_user",
  genAIApplication: "ChatGPT",
  genAIDomain: "chatgpt.com",
  riskLevel: "high",
  detectedCategories: ["email", "government_id", "bank_account"],
  actionTaken: "blocked",
  policyId: policy?.policyId,
  policyVersion: policy?.policyVersion,
  metadata: { rawPromptCollected: false, scanEngineVersion: "0.6.0" }
});
console.log("Reported sensitive prompt event.");

await client.reportSensitiveFileUploadEvent({
  userIdentifierHash: "hash_browser_demo_user",
  genAIApplication: "Claude",
  genAIDomain: "claude.ai",
  fileType: "pdf",
  fileSizeBucket: "1MB-5MB",
  fileHash: "sha256_hash_optional",
  riskLevel: "high",
  detectedCategories: ["customer_name", "email", "contract_value"],
  actionTaken: "blocked",
  policyId: policy?.policyId,
  policyVersion: policy?.policyVersion,
  metadata: { rawFileCollected: false, scanEngineVersion: "0.6.0" }
});
console.log("Reported sensitive file upload event.");

if (policy) {
  await client.reportPolicyStatus({
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    status: "applied",
    errorMessage: null
  });
  console.log("Reported policy status.");
}

await client.flushQueue();
