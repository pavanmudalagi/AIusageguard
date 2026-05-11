import { Router } from "express";
import type { InputType, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

const usageEventTypes = ["genai_app_used", "genai_app_detected"];
const promptSensitiveEventTypes = ["sensitive_prompt_detected", "prompt_blocked", "prompt_warned"];
const fileSensitiveEventTypes = ["sensitive_file_detected", "sensitive_file_upload_detected", "file_upload_blocked", "file_upload_warned"];

router.get("/overview", async (_req, res, next) => {
  try {
    const [
      aiToolsUsed,
      protectedEndpoints,
      sensitivePromptAttempts,
      sensitiveFileUploadAttempts,
      blockedEvents,
      warnedEvents,
      highCriticalRiskEvents,
      totalEndpoints,
      appliedEndpoints,
      totalGenAIAppsDetected,
      totalPromptsScanned,
      safePromptReplacements,
      filesScanned,
      sensitiveFilesDetected,
      fileUploadsBlocked,
      unknownAIAppsDetected
    ] = await Promise.all([
      prisma.usageEvent.groupBy({ by: ["genAIApplicationName"] }).then((rows) => rows.length),
      prisma.endpoint.count({ where: { OR: [{ browserExtensionVersion: { not: null } }, { localAgentVersion: { not: null } }] } }),
      prisma.usageEvent.count({ where: { eventType: { in: promptSensitiveEventTypes } } }),
      prisma.usageEvent.count({ where: { eventType: { in: fileSensitiveEventTypes } } }),
      prisma.usageEvent.count({ where: { actionTaken: "blocked" } }),
      prisma.usageEvent.count({ where: { actionTaken: "warned" } }),
      prisma.usageEvent.count({ where: { riskLevel: { in: ["high", "critical"] } } }),
      prisma.endpoint.count(),
      prisma.endpoint.count({ where: { policyStatus: "applied" } }),
      prisma.usageEvent.count({ where: { eventType: "genai_app_detected" } }),
      prisma.usageEvent.count({ where: { eventType: "prompt_scanned" } }),
      prisma.usageEvent.count({ where: { eventType: "prompt_replaced_with_safe_prompt" } }),
      prisma.usageEvent.count({ where: { eventType: "file_scanned" } }),
      prisma.usageEvent.count({ where: { eventType: "sensitive_file_detected" } }),
      prisma.usageEvent.count({ where: { eventType: "file_upload_blocked" } }),
      prisma.usageEvent.count({ where: { eventType: "unknown_genai_app_detected" } })
    ]);
    res.json({
      aiToolsUsed,
      protectedEndpoints,
      sensitivePromptAttempts,
      sensitiveFileUploadAttempts,
      blockedEvents,
      warnedEvents,
      highCriticalRiskEvents,
      policyCoveragePercent: totalEndpoints ? Math.round((appliedEndpoints / totalEndpoints) * 100) : 0,
      totalGenAIAppsDetected,
      totalPromptsScanned,
      safePromptReplacements,
      filesScanned,
      sensitiveFilesDetected,
      fileUploadsBlocked,
      unknownAIAppsDetected,
      pendingQueuedEvents: 0
    });
  } catch (error) {
    next(error);
  }
});

router.get("/ai-tools-summary", async (_req, res, next) => {
  try {
    const [uniqueTools, topToolsByUsageRaw, apps, events] = await Promise.all([
      prisma.usageEvent.groupBy({ by: ["genAIApplicationName"] }),
      prisma.usageEvent.groupBy({ by: ["genAIApplicationName"], _count: true, orderBy: { _count: { genAIApplicationName: "desc" } }, take: 5 }),
      prisma.genAIApplication.findMany(),
      prisma.usageEvent.findMany({ include: { genAIApplication: true }, orderBy: { createdAt: "asc" }, take: 2000 })
    ]);

    const riskCounts = new Map<string, number>();
    const usageByAppType = new Map<string, number>();
    const usageTrend = new Map<string, number>();
    for (const event of events) {
      const day = event.createdAt.toISOString().slice(0, 10);
      usageTrend.set(day, (usageTrend.get(day) ?? 0) + 1);
      usageByAppType.set(event.genAIApplication?.appType ?? "browser", (usageByAppType.get(event.genAIApplication?.appType ?? "browser") ?? 0) + 1);
      if (event.riskLevel === "high" || event.riskLevel === "critical" || event.eventType.includes("sensitive")) {
        riskCounts.set(event.genAIApplicationName, (riskCounts.get(event.genAIApplicationName) ?? 0) + 1);
      }
    }

    const approvalCounts = new Map<string, number>([["approved", 0], ["restricted", 0], ["blocked", 0], ["unknown", 0]]);
    for (const app of apps) approvalCounts.set(app.approvedStatus, (approvalCounts.get(app.approvedStatus) ?? 0) + 1);

    res.json({
      uniqueToolsCount: uniqueTools.length,
      topToolsByUsage: topToolsByUsageRaw.map((row) => ({ appName: row.genAIApplicationName, usageCount: row._count })),
      topToolsByRisk: [...riskCounts.entries()].map(([appName, riskEventCount]) => ({ appName, riskEventCount })).sort((a, b) => b.riskEventCount - a.riskEventCount).slice(0, 5),
      usageByAppType: [...usageByAppType.entries()].map(([appType, count]) => ({ appType, count })),
      appsByApprovalStatus: [...approvalCounts.entries()].map(([status, count]) => ({ status, count })),
      usageTrend: [...usageTrend.entries()].map(([day, count]) => ({ day, count }))
    });
  } catch (error) {
    next(error);
  }
});

router.get("/endpoint-ai-usage", async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize ?? 25), 1), 100);
    const sortBy = String(req.query.sortBy ?? "lastUsedAt");
    const sortDir = String(req.query.sortDir ?? "desc") === "asc" ? "asc" : "desc";
    const search = String(req.query.search ?? "").trim().toLowerCase();

    const where: Prisma.UsageEventWhereInput = {
      ...(req.query.organizationId ? { organizationId: String(req.query.organizationId) } : {}),
      ...(req.query.endpointId ? { endpointId: String(req.query.endpointId) } : {}),
      ...(req.query.genAIApplicationId ? { genAIApplicationId: String(req.query.genAIApplicationId) } : {}),
      ...(req.query.appType ? { genAIApplication: { appType: String(req.query.appType) as never } } : {}),
      ...(req.query.riskLevel ? { riskLevel: String(req.query.riskLevel) as never } : {}),
      ...(req.query.dateFrom || req.query.dateTo ? { createdAt: { ...(req.query.dateFrom ? { gte: new Date(String(req.query.dateFrom)) } : {}), ...(req.query.dateTo ? { lte: new Date(String(req.query.dateTo)) } : {}) } } : {})
    };

    const events = await prisma.usageEvent.findMany({
      where,
      include: { endpoint: true, endpointUser: true, genAIApplication: true },
      orderBy: { createdAt: "desc" },
      take: 5000
    });
    const policyIds = [...new Set(events.map((event) => event.endpoint.currentPolicyId).filter(Boolean))] as string[];
    const policies = await prisma.policy.findMany({ where: { id: { in: policyIds } } });
    const policyById = new Map(policies.map((policy) => [policy.id, policy]));

    const grouped = new Map<string, DashboardEndpointUsageRow>();
    for (const event of events) {
      const key = `${event.endpointId}:${event.genAIApplicationId ?? event.genAIApplicationName}`;
      const policy = event.endpoint.currentPolicyId ? policyById.get(event.endpoint.currentPolicyId) : undefined;
      const current = grouped.get(key) ?? {
        endpointId: event.endpointId,
        machineName: event.endpoint.hostname,
        userDisplay: event.endpointUser?.displayName ?? event.endpointUser?.userIdentifierHash ?? "unknown",
        operatingSystem: `${event.endpoint.os}${event.endpoint.osVersion ? ` ${event.endpoint.osVersion}` : ""}`,
        genAIApplicationId: event.genAIApplicationId,
        genAIApplicationName: event.genAIApplicationName,
        appType: event.genAIApplication?.appType ?? appTypeFromInput(event.inputType),
        usageCount: 0,
        piiAttemptCount: 0,
        sensitiveFileUploadCount: 0,
        lastUsedAt: event.createdAt.toISOString(),
        currentPolicyId: event.endpoint.currentPolicyId,
        currentPolicyName: policy?.name ?? "Unassigned",
        policyMode: policyMode(policy?.policyJson),
        policyStatus: event.endpoint.policyStatus
      };
      if (usageEventTypes.includes(event.eventType)) current.usageCount += 1;
      if (promptSensitiveEventTypes.includes(event.eventType)) current.piiAttemptCount += 1;
      if (fileSensitiveEventTypes.includes(event.eventType)) current.sensitiveFileUploadCount += 1;
      if (event.createdAt.toISOString() > current.lastUsedAt) current.lastUsedAt = event.createdAt.toISOString();
      grouped.set(key, current);
    }

    let items = [...grouped.values()];
    if (req.query.policyMode) items = items.filter((item) => item.policyMode === req.query.policyMode);
    if (req.query.policyStatus) items = items.filter((item) => item.policyStatus === req.query.policyStatus);
    if (req.query.minPiiAttemptCount) items = items.filter((item) => item.piiAttemptCount >= Number(req.query.minPiiAttemptCount));
    if (search) {
      items = items.filter((item) => [item.machineName, item.userDisplay, item.genAIApplicationName].some((value) => value.toLowerCase().includes(search)));
    }

    items.sort((a, b) => {
      const av = a[sortBy as keyof DashboardEndpointUsageRow] ?? "";
      const bv = b[sortBy as keyof DashboardEndpointUsageRow] ?? "";
      const result = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? result : -result;
    });

    const total = items.length;
    res.json({ items: items.slice((page - 1) * pageSize, page * pageSize), pagination: { page, pageSize, total } });
  } catch (error) {
    next(error);
  }
});

router.get("/risk-trends", async (_req, res, next) => {
  try {
    const events = await prisma.usageEvent.findMany({ select: { createdAt: true, riskLevel: true, detectedCategories: true, actionTaken: true }, orderBy: { createdAt: "asc" }, take: 1000 });
    const byDay = new Map<string, Record<string, number | string>>();
    const byCategory = new Map<string, number>();
    const byAction = new Map<string, number>();
    for (const event of events) {
      const day = event.createdAt.toISOString().slice(0, 10);
      const row = byDay.get(day) ?? { day, low: 0, medium: 0, high: 0, critical: 0 };
      row[event.riskLevel] = Number(row[event.riskLevel]) + 1;
      byDay.set(day, row);
      byAction.set(event.actionTaken, (byAction.get(event.actionTaken) ?? 0) + 1);
      for (const category of event.detectedCategories) byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
    }
    res.json({
      byDay: [...byDay.values()],
      byCategory: [...byCategory.entries()].map(([category, count]) => ({ category, count })),
      byAction: [...byAction.entries()].map(([action, count]) => ({ action, count }))
    });
  } catch (error) {
    next(error);
  }
});

router.get("/top-apps", async (_req, res, next) => {
  try {
    const grouped = await prisma.usageEvent.groupBy({ by: ["genAIApplicationName"], _count: true, orderBy: { _count: { genAIApplicationName: "desc" } }, take: 10 });
    res.json({ items: grouped.map((row) => ({ name: row.genAIApplicationName, count: row._count })) });
  } catch (error) {
    next(error);
  }
});

router.get("/top-risky-users", async (_req, res, next) => {
  try {
    const events = await prisma.usageEvent.findMany({ where: { riskLevel: { in: ["high", "critical"] } }, include: { endpointUser: true }, take: 1000 });
    const counts = new Map<string, number>();
    for (const event of events) {
      const key = event.endpointUser?.userIdentifierHash ?? "unknown";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    res.json({ items: [...counts.entries()].map(([user, count]) => ({ user, count })).sort((a, b) => b.count - a.count).slice(0, 10) });
  } catch (error) {
    next(error);
  }
});

router.get("/policy-status", async (_req, res, next) => {
  try {
    const grouped = await prisma.endpoint.groupBy({ by: ["policyStatus"], _count: true });
    res.json({ items: grouped.map((row) => ({ status: row.policyStatus, count: row._count })) });
  } catch (error) {
    next(error);
  }
});

export default router;

type DashboardEndpointUsageRow = {
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
};

function appTypeFromInput(inputType: InputType) {
  return inputType === "desktop_app" ? "desktop" : "browser";
}

function policyMode(value: Prisma.JsonValue | undefined) {
  if (value && typeof value === "object" && !Array.isArray(value) && "mode" in value && typeof value.mode === "string") {
    return value.mode;
  }
  return "monitor";
}
