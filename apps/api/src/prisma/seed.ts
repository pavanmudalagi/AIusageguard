import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { defaultPolicyJson } from "@ai-usage-guard/shared";

async function main() {
  const tokenHash = await bcrypt.hash(env.DEFAULT_ENROLLMENT_TOKEN, 12);
  const existingSecureFlow = await prisma.organization.findUnique({ where: { id: "org_secureflow" } });
  if (existingSecureFlow) {
    await ensurePersistentDefaults(existingSecureFlow.id);
    console.log("Seed defaults ensured without deleting existing data.");
    return;
  }

  const secureFlow = await prisma.organization.create({ data: { id: "org_secureflow", name: "SecureFlow Labs MSP", type: "msp", enrollmentTokenHash: tokenHash } });
  const acme = await prisma.organization.create({ data: { id: "org_acme_dental", name: "Acme Dental", type: "customer", parentOrgId: secureFlow.id, enrollmentTokenHash: tokenHash } });
  const northwind = await prisma.organization.create({ data: { id: "org_northwind_accounting", name: "Northwind Accounting", type: "customer", parentOrgId: secureFlow.id, enrollmentTokenHash: tokenHash } });

  const admin = await prisma.user.create({
    data: {
      id: "usr_seed_admin",
      organizationId: secureFlow.id,
      email: "admin@secureflow.example",
      name: "SecureFlow Admin",
      role: "msp_admin",
      passwordHash: await bcrypt.hash("Password123!", 12)
    }
  });
  await prisma.user.create({
    data: {
      organizationId: acme.id,
      email: "admin@acmedental.example",
      name: "Acme Admin",
      role: "customer_admin",
      passwordHash: await bcrypt.hash("Password123!", 12)
    }
  });

  const apps = await Promise.all([
    app("ChatGPT", "browser", "chatgpt.com", "medium", "restricted"),
    app("Microsoft Copilot", "browser_and_desktop", "copilot.microsoft.com", "low", "approved"),
    app("Claude", "browser", "claude.ai", "medium", "restricted"),
    app("Claude Desktop", "desktop", null, "medium", "restricted", "Claude.exe"),
    app("Gemini", "browser", "gemini.google.com", "medium", "unknown"),
    app("Perplexity", "browser", "perplexity.ai", "medium", "unknown"),
    app("Grok", "browser", "grok.com", "high", "unknown"),
    app("Unknown AI Tool", "desktop", null, "high", "unknown", "unknown-ai.exe")
  ]);
  const appByName = new Map(apps.map((item) => [item.name, item]));

  const endpoint1 = await endpoint(acme.id, "device_win_laptop_001", "WIN-LAPTOP-001", "windows", "11", "0.6.0", "0.1.0");
  const endpoint2 = await endpoint(acme.id, "device_win_desktop_004", "WIN-DESKTOP-004", "windows", "10", "0.6.0", null);
  const endpoint3 = await endpoint(northwind.id, "device_macbook_017", "MACBOOK-017", "macos", "14.5", "0.6.0", "0.1.0");
  const endpoint4 = await endpoint(acme.id, "device_win_laptop_008", "WIN-LAPTOP-008", "windows", "11", "0.6.0", "0.1.0");

  const user1 = await prisma.endpointUser.create({ data: { endpointId: endpoint1.id, userIdentifierHash: "hash_user_amy", displayName: "Amy R.", lastSeenAt: new Date() } });
  const user2 = await prisma.endpointUser.create({ data: { endpointId: endpoint2.id, userIdentifierHash: "hash_user_ben", displayName: "Ben K.", lastSeenAt: new Date() } });
  const user3 = await prisma.endpointUser.create({ data: { endpointId: endpoint3.id, userIdentifierHash: "hash_user_northwind_01", displayName: "NW User 01", lastSeenAt: new Date() } });
  const user4 = await prisma.endpointUser.create({ data: { endpointId: endpoint4.id, userIdentifierHash: "hash_user_jules", displayName: "Jules M.", lastSeenAt: new Date() } });

  const passive = await policy(acme.id, admin.id, "pol_passive", "Default Passive Coaching Policy", "passive", "warn");
  const active = await policy(acme.id, admin.id, "pol_active", "Active Protection Policy", "active", "block");
  const copilotPolicy = await policy(acme.id, admin.id, "pol_copilot", "Approved Copilot Policy", "active", "warn", [{ appName: "Microsoft Copilot", appType: "browser_and_desktop", domains: ["copilot.microsoft.com"], piiHandling: "warn", fileUploadHandling: "warn", allowedDataCategories: ["business_general", "internal_low_risk"], blockedDataCategories: ["api_key", "password", "private_key", "payment_card", "government_id"] }]);
  const blockUnknown = await policy(acme.id, admin.id, "pol_block_unknown", "Block Unknown AI Tools Policy", "active", "block");

  await prisma.policyAssignment.create({ data: { policyId: active.id, organizationId: acme.id, assignmentType: "organization", priority: 10 } });
  await prisma.policyDelivery.create({ data: { policyId: active.id, endpointId: endpoint1.id, policyVersion: active.version, deliveryStatus: "applied", deliveredAt: new Date(), appliedAt: new Date() } });
  await prisma.endpoint.update({ where: { id: endpoint1.id }, data: { currentPolicyId: active.id, currentPolicyVersion: active.version, policyStatus: "applied" } });
  await prisma.policyDelivery.create({ data: { policyId: copilotPolicy.id, endpointId: endpoint2.id, policyVersion: copilotPolicy.version, deliveryStatus: "applied", deliveredAt: new Date(), appliedAt: new Date() } });
  await prisma.endpoint.update({ where: { id: endpoint2.id }, data: { currentPolicyId: copilotPolicy.id, currentPolicyVersion: copilotPolicy.version, policyStatus: "applied" } });
  await prisma.policyDelivery.create({ data: { policyId: passive.id, endpointId: endpoint3.id, policyVersion: passive.version, deliveryStatus: "applied", deliveredAt: new Date(), appliedAt: new Date() } });
  await prisma.endpoint.update({ where: { id: endpoint3.id }, data: { currentPolicyId: passive.id, currentPolicyVersion: passive.version, policyStatus: "applied" } });
  await prisma.policyDelivery.create({ data: { policyId: blockUnknown.id, endpointId: endpoint4.id, policyVersion: blockUnknown.version, deliveryStatus: "pending" } });
  await prisma.endpoint.update({ where: { id: endpoint4.id }, data: { currentPolicyId: blockUnknown.id, currentPolicyVersion: blockUnknown.version, policyStatus: "pending" } });

  await prisma.browserPluginVersion.createMany({
    data: [
      { version: "0.7.1", browser: "chrome", targetBrowser: "chrome", status: "latest", releaseNotes: "MV3 module service worker manifest fix, narrowed GenAI host permissions, local icons, metadata-only telemetry.", minimumSupportedVersion: "0.6.0", severity: "recommended", rolloutRing: "full", isLatest: true, publishedAt: new Date(), createdByUserId: admin.id },
      { version: "0.7.1", browser: "edge", targetBrowser: "edge", status: "latest", releaseNotes: "Edge package with MV3 module service worker and managed enrollment configuration.", minimumSupportedVersion: "0.6.0", severity: "recommended", rolloutRing: "full", isLatest: true, publishedAt: new Date(), createdByUserId: admin.id },
      { version: "0.6.0", browser: "chrome", targetBrowser: "chrome", status: "published", releaseNotes: "Earlier policy sync build.", severity: "optional", rolloutRing: "full", isLatest: false, publishedAt: new Date(), createdByUserId: admin.id }
    ]
  });
  await pluginInstall(acme.id, endpoint1.id, endpoint1.deviceId, endpoint1.hostname, "chrome", "125.0.0", "0.7.1", "active", active.id, active.version, "applied");
  await pluginInstall(acme.id, endpoint2.id, endpoint2.deviceId, endpoint2.hostname, "chrome", "125.0.0", "0.7.1", "active", copilotPolicy.id, copilotPolicy.version, "applied");
  await pluginInstall(northwind.id, endpoint3.id, endpoint3.deviceId, endpoint3.hostname, "chrome", "124.0.0", "0.6.0", "outdated", passive.id, passive.version, "applied");
  await pluginInstall(acme.id, endpoint4.id, endpoint4.deviceId, endpoint4.hostname, "edge", "125.0.0", "0.7.1", "installed", blockUnknown.id, blockUnknown.version, "pending");

  await demoUsage(acme.id, endpoint1.id, user1.id, appByName.get("ChatGPT")!.id, "ChatGPT", "browser", 34, 5, 0, active.id, active.version);
  await demoUsage(northwind.id, endpoint3.id, user3.id, appByName.get("Claude Desktop")!.id, "Claude Desktop", "desktop_app", 19, 2, 3, passive.id, passive.version);
  await demoUsage(acme.id, endpoint2.id, user2.id, appByName.get("Microsoft Copilot")!.id, "Microsoft Copilot", "browser", 55, 1, 0, copilotPolicy.id, copilotPolicy.version);
  await demoUsage(acme.id, endpoint4.id, user4.id, appByName.get("Unknown AI Tool")!.id, "Unknown AI Tool", "desktop_app", 6, 4, 0, blockUnknown.id, blockUnknown.version);

  await usage(acme.id, endpoint1.id, user1.id, appByName.get("ChatGPT")!.id, "ChatGPT", "prompt_scanned", "prompt", "low", [], "allowed", passive.id, passive.version, { scanEngineVersion: "0.6.0", rawPromptCollected: false });
  await usage(acme.id, endpoint1.id, user1.id, appByName.get("ChatGPT")!.id, "ChatGPT", "sensitive_prompt_detected", "prompt", "high", ["email", "government_id", "bank_account"], "blocked", active.id, active.version, { scanEngineVersion: "0.6.0", rawPromptCollected: false });
  await usage(acme.id, endpoint2.id, user2.id, appByName.get("Claude")!.id, "Claude", "sensitive_file_upload_detected", "file_upload", "high", ["customer_name", "email", "contract_value"], "blocked", active.id, active.version, { fileType: "pdf", fileSizeBucket: "1MB-5MB", fileHash: "sha256_demo_pdf_hash", rawFileCollected: false, scanEngineVersion: "0.6.0" });
  await usage(acme.id, endpoint2.id, user2.id, appByName.get("Unknown AI Tool")!.id, "Unknown AI Tool", "sensitive_prompt_detected", "desktop_app", "critical", ["api_key"], "blocked", active.id, active.version, { scanEngineVersion: "0.1.0", rawPromptCollected: false });
  await usage(acme.id, endpoint1.id, user1.id, appByName.get("Microsoft Copilot")!.id, "Microsoft Copilot", "sensitive_prompt_detected", "prompt", "medium", ["email", "customer_name"], "warned", active.id, active.version, { scanEngineVersion: "0.6.0", rawPromptCollected: false });
  await usage(acme.id, endpoint1.id, user1.id, appByName.get("Microsoft Copilot")!.id, "Microsoft Copilot", "sensitive_prompt_detected", "prompt", "medium", ["email"], "user_override", active.id, active.version, { justificationProvided: true, rawPromptCollected: false });
  await usage(northwind.id, endpoint3.id, user3.id, appByName.get("Gemini")!.id, "Gemini", "policy_applied", "desktop_app", "low", [], "allowed", active.id, active.version, { policyApplied: true });

  await prisma.educationRecommendation.create({
    data: {
      organizationId: acme.id,
      userIdentifierHash: "hash_user_amy",
      endpointId: endpoint1.id,
      categories: ["email", "customer_name"],
      riskyEventCount: 3,
      recommendedTopic: "Safe GenAI usage with sensitive data placeholders"
    }
  });

  await ensurePersistentDefaults(secureFlow.id);

  console.log("Seed complete. Login: admin@secureflow.example / Password123!");
}

function app(name: string, appType: "browser" | "desktop" | "browser_and_desktop", domain: string | null, riskRating: "low" | "medium" | "high" | "critical", approvedStatus: "approved" | "restricted" | "blocked" | "unknown", executableName?: string) {
  return prisma.genAIApplication.create({ data: { name, appType, domain, executableName, riskRating, approvedStatus } });
}

function endpoint(organizationId: string, deviceId: string, hostname: string, os: string, osVersion: string, browserExtensionVersion: string | null, localAgentVersion: string | null) {
  return prisma.endpoint.create({ data: { organizationId, deviceId, hostname, os, osVersion, browserExtensionVersion, localAgentVersion, lastSeenAt: new Date(), policyStatus: "pending" } });
}

type DemoPolicyApplication = {
  appName: string;
  appType: "browser" | "desktop" | "browser_and_desktop";
  domains?: string[];
  piiHandling?: "allow" | "warn" | "block" | "redact";
  fileUploadHandling?: "allow" | "warn" | "block" | "redact";
  allowedDataCategories?: string[];
  blockedDataCategories?: string[];
};

function policy(organizationId: string, createdByUserId: string, id: string, name: string, mode: "monitor" | "passive" | "active", defaultAction: "allow" | "warn" | "block", applications: DemoPolicyApplication[] = []) {
  return prisma.policy.create({
    data: {
      id,
      organizationId,
      name,
      description: `${name} demo policy`,
      version: "2026.05.07.002",
      status: "published",
      policyJson: { ...defaultPolicyJson, mode, defaultAction, applications } as Prisma.InputJsonValue,
      createdByUserId,
      publishedAt: new Date()
    }
  });
}

async function demoUsage(organizationId: string, endpointId: string, endpointUserId: string, genAIApplicationId: string, genAIApplicationName: string, inputType: "browser" | "desktop_app", usageCount: number, piiAttempts: number, fileAttempts: number, policyId: string, policyVersion: string) {
  for (let index = 0; index < usageCount; index += 1) {
    await usage(organizationId, endpointId, endpointUserId, genAIApplicationId, genAIApplicationName, "genai_app_used", inputType, "low", [], "allowed", policyId, policyVersion, inputType === "browser" ? { browser: "chrome", rawPromptCollected: false } : { rawPromptCollected: false });
  }
  for (let index = 0; index < piiAttempts; index += 1) {
    await usage(organizationId, endpointId, endpointUserId, genAIApplicationId, genAIApplicationName, "sensitive_prompt_detected", "prompt", index % 2 === 0 ? "high" : "medium", ["email", "customer_name"], index % 2 === 0 ? "blocked" : "warned", policyId, policyVersion, { scanEngineVersion: "0.6.0", rawPromptCollected: false });
  }
  for (let index = 0; index < fileAttempts; index += 1) {
    await usage(organizationId, endpointId, endpointUserId, genAIApplicationId, genAIApplicationName, "sensitive_file_upload_detected", "file_upload", "high", ["email", "contract_value"], "blocked", policyId, policyVersion, { fileType: "pdf", fileSizeBucket: "1MB-5MB", rawFileCollected: false });
  }
}

function usage(organizationId: string, endpointId: string, endpointUserId: string, genAIApplicationId: string, genAIApplicationName: string, eventType: string, inputType: "prompt" | "file_upload" | "desktop_app" | "browser", riskLevel: "low" | "medium" | "high" | "critical", detectedCategories: string[], actionTaken: "allowed" | "warned" | "blocked" | "redacted" | "user_override", policyId: string, policyVersion: string, metadata: Prisma.InputJsonValue) {
  return prisma.usageEvent.create({ data: { organizationId, endpointId, endpointUserId, genAIApplicationId, genAIApplicationName, eventType, inputType, riskLevel, detectedCategories, actionTaken, policyId, policyVersion, metadata } });
}

function pluginInstall(organizationId: string, endpointId: string, deviceId: string, machineName: string, browser: "chrome" | "edge", browserVersion: string, pluginVersion: string, installStatus: "installed" | "active" | "inactive" | "outdated" | "failed", currentPolicyId: string, currentPolicyVersion: string, policyStatus: "applied" | "pending" | "failed" | "unknown" | "out_of_date") {
  return prisma.browserPluginInstall.create({ data: { organizationId, endpointId, deviceId, machineName, browser, browserVersion, pluginVersion, latestAvailableVersion: "0.7.1", installStatus, updateStatus: installStatus === "outdated" ? "update_available" : "up_to_date", lastSeenAt: new Date(), currentPolicyId, currentPolicyVersion, policyStatus } });
}

async function ensurePersistentDefaults(defaultOrganizationId: string) {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  for (const org of orgs) {
    await prisma.organizationSettings.upsert({
      where: { organizationId: org.id },
      update: {},
      create: {
        organizationId: org.id,
        uiTheme: "system",
        eventRetentionDays: 90,
        alertRetentionDays: 180,
        auditLogRetentionDays: 365,
        reportCleanPromptScans: false,
        reportSensitiveEvents: true
      }
    });
  }

  await prisma.appSetting.upsert({
    where: { key: "persistence" },
    update: { value: { postgres: true, seedDeletesData: false } },
    create: { key: "persistence", value: { postgres: true, seedDeletesData: false } }
  });

  for (const template of defaultTemplates(defaultOrganizationId)) {
    const organizationId = template.organizationId!;
    const version = template.version ?? "1.0";
    await prisma.emailTemplate.upsert({
      where: { organizationId_name_version: { organizationId, name: template.name, version } },
      update: {},
      create: { ...template, organizationId, version }
    });
  }
}

function defaultTemplates(organizationId: string): Prisma.EmailTemplateUncheckedCreateInput[] {
  return [
    {
      organizationId,
      name: "Safe GenAI Usage Education",
      type: "education_blog",
      category: "safe_genai_usage",
      subject: "Using GenAI safely",
      body: "Use approved AI tools, remove sensitive values, and replace real data with placeholders before submitting prompts or files.",
      variables: [],
      status: "published",
      version: "1.0",
      publishedAt: new Date()
    },
    {
      organizationId,
      name: "PII Detected Coaching Email",
      type: "user_coaching",
      category: "pii_detected",
      subject: "Using GenAI safely with sensitive information",
      body: "Hi {{userName}},\n\nA recent GenAI interaction triggered a sensitive-data warning. Please avoid sharing customer names, government IDs, financial details, credentials, or internal confidential information with AI tools.\n\nUse placeholders such as [Customer Name], [Email Address], or [Account ID] instead.\n\nThank you.",
      variables: ["userName"],
      status: "published",
      version: "1.0",
      publishedAt: new Date()
    },
    {
      organizationId,
      name: "File Upload Blocked Coaching Email",
      type: "user_coaching",
      category: "file_upload_blocked",
      subject: "Sensitive file upload blocked",
      body: "Hi {{userName}},\n\nAI Usage Guard blocked a file upload because it appeared to contain sensitive data. Remove customer data, credentials, identifiers, or financial details before using GenAI tools.\n\nThank you.",
      variables: ["userName"],
      status: "published",
      version: "1.0",
      publishedAt: new Date()
    },
    {
      organizationId,
      name: "Policy Violation Notification",
      type: "notification",
      category: "policy_violation",
      subject: "AI Usage Guard policy violation",
      body: "A policy violation was detected for {{machineName}}. Review the dashboard alert for metadata-only details.",
      variables: ["machineName"],
      status: "published",
      version: "1.0",
      publishedAt: new Date()
    },
    {
      organizationId,
      name: "Admin Alert Notification",
      type: "notification",
      category: "admin_alert",
      subject: "AI Usage Guard alert",
      body: "An alert was created with severity {{severity}}. Open the dashboard to investigate.",
      variables: ["severity"],
      status: "published",
      version: "1.0",
      publishedAt: new Date()
    },
    {
      organizationId,
      name: "Plugin Update Required Notification",
      type: "notification",
      category: "plugin_update_required",
      subject: "Browser Shield Plugin update required",
      body: "A Browser Shield Plugin update is required. Deploy the latest package through Chrome Enterprise, RMM, MDM, or your approved browser extension deployment workflow.",
      variables: [],
      status: "published",
      version: "1.0",
      publishedAt: new Date()
    }
  ];
}

main().finally(async () => prisma.$disconnect());
