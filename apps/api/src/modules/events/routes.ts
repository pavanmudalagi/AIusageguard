import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { Prisma } from "@prisma/client";
import { eventIngestSchema, normalizeGenAIAppName } from "@ai-usage-guard/shared";
import { prisma } from "../../config/prisma";
import { requireAuth, requireEndpointToken } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";

const router = Router();
const ingestLimiter = rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false });
const riskEventTypes = [
  "sensitive_prompt_detected",
  "prompt_blocked",
  "prompt_warned",
  "sensitive_file_detected",
  "sensitive_file_upload_detected",
  "file_upload_blocked",
  "file_upload_warned",
  "file_scan_failed"
];

router.post("/", ingestLimiter, requireEndpointToken, validateBody(eventIngestSchema), async (req, res, next) => {
  try {
    const body = req.body;
    const appName = normalizeGenAIAppName(body.genAIApplication);
    const endpoint = await prisma.endpoint.upsert({
      where: { organizationId_deviceId: { organizationId: body.organizationId, deviceId: body.deviceId } },
      update: { lastSeenAt: new Date(), hostname: body.machineName ?? undefined, browserExtensionVersion: body.pluginVersion ?? undefined },
      create: { organizationId: body.organizationId, deviceId: body.deviceId, hostname: body.machineName ?? body.deviceId, os: "browser", lastSeenAt: new Date(), browserExtensionVersion: body.pluginVersion }
    });
    if (body.browser && body.pluginVersion) {
      await prisma.browserPluginInstall.upsert({
        where: { organizationId_deviceId_browser: { organizationId: body.organizationId, deviceId: body.deviceId, browser: body.browser === "edge" ? "edge" : "chrome" } },
        update: { endpointId: endpoint.id, machineName: body.machineName ?? endpoint.hostname, browserVersion: body.browserVersion, pluginVersion: body.pluginVersion, installStatus: "active", lastSeenAt: new Date(), currentPolicyId: body.policyId, currentPolicyVersion: body.policyVersion, policyStatus: body.eventType === "policy_applied" ? "applied" : endpoint.policyStatus },
        create: { organizationId: body.organizationId, endpointId: endpoint.id, deviceId: body.deviceId, machineName: body.machineName ?? endpoint.hostname, browser: body.browser === "edge" ? "edge" : "chrome", browserVersion: body.browserVersion, pluginVersion: body.pluginVersion, installStatus: "active", lastSeenAt: new Date(), currentPolicyId: body.policyId, currentPolicyVersion: body.policyVersion, policyStatus: body.eventType === "policy_applied" ? "applied" : "pending" }
      });
    }
    const endpointUser = body.userIdentifierHash
      ? await prisma.endpointUser.upsert({
        where: { endpointId_userIdentifierHash: { endpointId: endpoint.id, userIdentifierHash: body.userIdentifierHash } },
        update: { lastSeenAt: new Date() },
        create: { endpointId: endpoint.id, userIdentifierHash: body.userIdentifierHash, lastSeenAt: new Date() }
      })
      : null;
    const appLookup = {
      name: appName,
      domain: body.genAIDomain ?? null,
      executableName: body.executableName ?? null
    };
    const existingApp = await prisma.genAIApplication.findFirst({ where: appLookup });
    const app = existingApp
      ? await prisma.genAIApplication.update({ where: { id: existingApp.id }, data: { updatedAt: new Date(), lastSeenAt: new Date() } })
      : await prisma.genAIApplication.create({
        data: { organizationId: body.organizationId, name: appName, appType: body.inputType === "desktop_app" ? "desktop" : "browser", domain: body.genAIDomain, executableName: body.executableName, riskRating: body.riskLevel, approvedStatus: "unknown", firstSeenAt: new Date(), lastSeenAt: new Date() }
      });
    const storedRiskLevel = body.riskLevel === "none" ? "low" : body.riskLevel;
    const event = await prisma.usageEvent.create({
      data: {
        organizationId: body.organizationId,
        endpointId: endpoint.id,
        endpointUserId: endpointUser?.id,
        genAIApplicationId: app.id,
        genAIApplicationName: appName,
        genAIDomain: body.genAIDomain,
        eventType: body.eventType,
        inputType: body.inputType,
        riskLevel: storedRiskLevel,
        detectedCategories: body.detectedCategories,
        detectedCategoryCounts: body.detectedCategoryCounts ?? {},
        actionTaken: body.actionTaken,
        policyId: body.policyId,
        policyName: body.policyName,
        policyVersion: body.policyVersion,
        policyMode: body.policyMode,
        fileType: body.fileType,
        fileSizeBucket: body.fileSizeBucket,
        scanStatus: body.scanStatus,
        scanFailureReason: body.scanFailureReason,
        userOverride: Boolean(body.userOverride),
        userJustificationProvided: Boolean(body.userJustificationProvided),
        metadata: {
          rawPromptCollected: false,
          rawFileCollected: false,
          machineName: body.machineName,
          browser: body.browser,
          browserVersion: body.browserVersion,
          pluginVersion: body.pluginVersion,
          fileType: body.fileType,
          fileSizeBucket: body.fileSizeBucket,
          fileNameHash: body.fileNameHash,
          fileHash: body.fileHash,
          detectedCategoryCounts: body.detectedCategoryCounts,
          policyName: body.policyName,
          policyMode: body.policyMode,
          scanStatus: body.scanStatus,
          scanFailureReason: body.scanFailureReason,
          userOverride: body.userOverride,
          userJustificationProvided: body.userJustificationProvided,
          userJustification: body.userJustification,
          reportedRiskLevel: body.riskLevel,
          ...body.metadata
        }
      }
    });
    await createAlertForEvent(event.id, endpoint.id, body);
    res.status(201).json({ success: true, eventId: event.id });
  } catch (error) {
    next(error);
  }
});

async function createAlertForEvent(eventId: string, endpointId: string, body: any) {
  const severity = alertSeverityForEvent(body);
  if (!severity) return;
  await prisma.alert.create({
    data: {
      organizationId: body.organizationId,
      title: alertTitleForEvent(body),
      description: alertDescriptionForEvent(body),
      severity,
      status: "open",
      sourceEventId: eventId,
      endpointId,
      genAIAppName: normalizeGenAIAppName(body.genAIApplication),
      detectedCategories: body.detectedCategories ?? []
    }
  });
}

function alertSeverityForEvent(body: any) {
  if (body.riskLevel === "critical") return "critical";
  if (["prompt_blocked", "file_upload_blocked"].includes(body.eventType)) return body.riskLevel === "critical" ? "critical" : "high";
  if (body.eventType === "policy_sync_failed") return "medium";
  if (body.eventType === "plugin_update_available" && body.metadata?.severity === "required") return "medium";
  return null;
}

function alertTitleForEvent(body: any) {
  if (body.eventType === "file_upload_blocked") return "Sensitive file upload blocked";
  if (body.eventType === "prompt_blocked") return "Sensitive prompt blocked";
  if (body.eventType === "policy_sync_failed") return "Policy sync failed";
  if (body.eventType === "plugin_update_available") return "Plugin update required";
  if (body.riskLevel === "critical") return "Critical sensitive data event detected";
  return "AI Usage Guard alert";
}

function alertDescriptionForEvent(body: any) {
  if (body.eventType === "file_upload_blocked") return "A file upload containing sensitive data was blocked by policy.";
  if (body.eventType === "prompt_blocked") return "A prompt containing sensitive data was blocked by policy.";
  if (body.eventType === "policy_sync_failed") return "A browser plugin or endpoint failed to synchronize its policy.";
  if (body.eventType === "plugin_update_available") return "A browser plugin reported that a required update is available for administrator deployment.";
  return "A high-risk AI usage event was detected. Metadata only was stored.";
}

function buildEventWhere(req: any, extra: Prisma.UsageEventWhereInput = {}): Prisma.UsageEventWhereInput {
  const search = String(req.query.search ?? "").trim();
  return {
    ...(req.query.organizationId ? { organizationId: String(req.query.organizationId) } : {}),
    ...(req.query.endpointId ? { endpointId: String(req.query.endpointId) } : {}),
    ...(req.query.genAIApplicationId ? { genAIApplicationId: String(req.query.genAIApplicationId) } : {}),
    ...(req.query.eventType ? { eventType: String(req.query.eventType) } : {}),
    ...(req.query.inputType ? { inputType: String(req.query.inputType) as never } : {}),
    ...(req.query.riskLevel ? { riskLevel: String(req.query.riskLevel) as never } : {}),
    ...(req.query.actionTaken ? { actionTaken: String(req.query.actionTaken) as never } : {}),
    ...(req.query.policyId ? { policyId: String(req.query.policyId) } : {}),
    ...(req.query.dateFrom || req.query.dateTo ? { createdAt: { ...(req.query.dateFrom ? { gte: new Date(String(req.query.dateFrom)) } : {}), ...(req.query.dateTo ? { lte: new Date(String(req.query.dateTo)) } : {}) } } : {}),
    ...(search ? { OR: [{ genAIApplicationName: { contains: search, mode: "insensitive" as const } }, { genAIDomain: { contains: search, mode: "insensitive" as const } }, { endpoint: { hostname: { contains: search, mode: "insensitive" as const } } }] } : {}),
    ...extra
  };
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1);
    const pageSize = Math.min(Number(req.query.pageSize ?? 50), 100);
    const where = buildEventWhere(req);
    const [items, total] = await Promise.all([
      prisma.usageEvent.findMany({ where, include: { endpoint: true, endpointUser: true }, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: "desc" } }),
      prisma.usageEvent.count({ where })
    ]);
    res.json({ items, page, pageSize, total });
  } catch (error) {
    next(error);
  }
});

router.get("/activity", requireAuth, async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1);
    const pageSize = Math.min(Number(req.query.pageSize ?? 50), 100);
    const where = buildEventWhere(req);
    const [items, total] = await Promise.all([
      prisma.usageEvent.findMany({ where, include: { endpoint: true, endpointUser: true }, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: "desc" } }),
      prisma.usageEvent.count({ where })
    ]);
    res.json({ items, page, pageSize, total });
  } catch (error) {
    next(error);
  }
});

router.get("/risk", requireAuth, async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1);
    const pageSize = Math.min(Number(req.query.pageSize ?? 50), 100);
    const where = buildEventWhere(req, { eventType: { in: riskEventTypes } });
    const [items, total] = await Promise.all([
      prisma.usageEvent.findMany({ where, include: { endpoint: true, endpointUser: true }, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: "desc" } }),
      prisma.usageEvent.count({ where })
    ]);
    res.json({ items, page, pageSize, total });
  } catch (error) {
    next(error);
  }
});

router.get("/summary", requireAuth, async (_req, res, next) => {
  try {
    const byRisk = await prisma.usageEvent.groupBy({ by: ["riskLevel"], _count: true });
    const byAction = await prisma.usageEvent.groupBy({ by: ["actionTaken"], _count: true });
    res.json({ byRisk, byAction });
  } catch (error) {
    next(error);
  }
});

export default router;
