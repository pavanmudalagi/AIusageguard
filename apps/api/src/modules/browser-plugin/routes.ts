import crypto from "node:crypto";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireEndpointToken } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { auditLog } from "../../middleware/audit";
import { createZip, checksum } from "./zip";
import { pluginFiles } from "./package-template";

const router = Router();

const tokenSchema = z.object({
  organizationId: z.string(),
  policyId: z.string(),
  expiresInDays: z.number().int().min(1).max(90).default(30),
  targetBrowser: z.enum(["chrome", "edge"]).default("chrome")
});

const packageSchema = tokenSchema.extend({
  serverUrl: z.string().url(),
  packageType: z.enum(["unpacked_zip", "managed_deployment", "policy_json_only"]).default("unpacked_zip"),
  enrollmentTokenExpiresInDays: z.number().int().min(1).max(90).default(30)
}).omit({ expiresInDays: true });

const versionSchema = z.object({
  version: z.string().min(1).max(64),
  targetBrowser: z.enum(["chrome", "edge"]).default("chrome"),
  releaseNotes: z.string().min(1).max(4000),
  minimumSupportedVersion: z.string().max(64).nullable().optional(),
  severity: z.enum(["optional", "recommended", "required"]).default("recommended"),
  status: z.enum(["draft", "published", "latest", "deprecated"]).default("published"),
  rolloutRing: z.enum(["pilot", "staged", "full"]).default("full"),
  packagePath: z.string().max(1000).nullable().optional(),
  checksum: z.string().max(256).nullable().optional()
});

const rolloutSchema = z.object({
  organizationId: z.string(),
  pluginVersionId: z.string(),
  rolloutName: z.string().min(1).max(200),
  rolloutRing: z.enum(["pilot", "staged", "full"]),
  targetType: z.enum(["organization", "endpoint_group", "endpoint"]),
  targetId: z.string().nullable().optional(),
  status: z.enum(["draft", "active", "paused", "completed"]).default("active")
});

const updateStatusSchema = z.object({
  organizationId: z.string(),
  deviceId: z.string(),
  currentVersion: z.string(),
  latestAvailableVersion: z.string().optional(),
  browser: z.enum(["chrome", "edge"]).default("chrome"),
  updateStatus: z.enum(["up_to_date", "update_available", "update_required", "pending_admin_deployment", "failed", "unknown"]),
  acknowledged: z.boolean().default(false)
});

router.post("/update-status", requireEndpointToken, validateBody(updateStatusSchema), async (req, res, next) => {
  try {
    const endpoint = await prisma.endpoint.findUnique({
      where: { organizationId_deviceId: { organizationId: req.body.organizationId, deviceId: req.body.deviceId } }
    });
    const latest = req.body.latestAvailableVersion
      ? await prisma.browserPluginVersion.findFirst({ where: { version: req.body.latestAvailableVersion, targetBrowser: req.body.browser } })
      : null;
    await prisma.browserPluginInstall.updateMany({
      where: { organizationId: req.body.organizationId, deviceId: req.body.deviceId, browser: req.body.browser },
      data: {
        pluginVersion: req.body.currentVersion,
        latestAvailableVersion: req.body.latestAvailableVersion,
        updateStatus: req.body.updateStatus,
        installStatus: req.body.updateStatus === "up_to_date" ? "active" : req.body.updateStatus === "failed" ? "failed" : "outdated",
        lastSeenAt: new Date()
      }
    });
    if (endpoint && latest) {
      await prisma.pluginUpdateNotice.upsert({
        where: { endpointId_pluginVersionId: { endpointId: endpoint.id, pluginVersionId: latest.id } },
        update: {
          status: req.body.updateStatus === "up_to_date" ? "completed" : req.body.acknowledged ? "acknowledged" : "seen",
          acknowledgedAt: req.body.acknowledged ? new Date() : undefined,
          completedAt: req.body.updateStatus === "up_to_date" ? new Date() : undefined
        },
        create: {
          organizationId: req.body.organizationId,
          endpointId: endpoint.id,
          pluginVersionId: latest.id,
          status: req.body.updateStatus === "up_to_date" ? "completed" : req.body.acknowledged ? "acknowledged" : "seen",
          acknowledgedAt: req.body.acknowledged ? new Date() : undefined,
          completedAt: req.body.updateStatus === "up_to_date" ? new Date() : undefined
        }
      });
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/download/:version", requireAuth, async (req, res, next) => {
  try {
    const version = await prisma.browserPluginVersion.findFirstOrThrow({ where: { version: req.params.version } });
    const zip = version.packagePath && fs.existsSync(version.packagePath)
      ? fs.readFileSync(version.packagePath)
      : createZip(pluginFiles({
        serverUrl: `${req.protocol}://${req.get("host")}`,
        organizationId: "configure-with-managed-storage",
        enrollmentToken: "configure-with-managed-storage",
        defaultPolicyId: "assigned-by-server",
        pluginMode: "managed",
        createdAt: new Date().toISOString()
      }, version.targetBrowser, version.version));
    await prisma.browserPluginDownload.create({
      data: {
        pluginVersionId: version.id,
        version: version.version,
        targetBrowser: version.targetBrowser,
        packageChecksum: checksum(zip),
        downloadedByUserId: req.user!.id,
        metadata: { generatedPackage: !version.packagePath }
      }
    });
    res.setHeader("content-type", "application/zip");
    res.setHeader("content-disposition", `attachment; filename="ai-usage-guard-browser-shield-${version.version}.zip"`);
    res.setHeader("x-package-checksum", checksum(zip));
    res.send(zip);
  } catch (error) {
    next(error);
  }
});

router.get("/update-manifest.xml", async (req, res, next) => {
  try {
    const latest = await prisma.browserPluginVersion.findFirst({ where: { OR: [{ isLatest: true }, { status: "latest" }] }, orderBy: [{ isLatest: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }] });
    if (!latest) return res.status(404).type("application/xml").send("<error>No latest plugin version registered</error>");
    const codebase = `${req.protocol}://${req.get("host")}/api/v1/browser-plugin/download/${encodeURIComponent(latest.version)}`;
    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">\n  <app appid="ai-usage-guard-browser-shield">\n    <updatecheck codebase="${escapeXml(codebase)}" version="${escapeXml(latest.version)}" />\n  </app>\n</gupdate>\n`);
  } catch (error) {
    next(error);
  }
});

router.use(requireAuth);

router.get("/versions", async (_req, res, next) => {
  try {
    const items = await prisma.browserPluginVersion.findMany({ orderBy: [{ isLatest: "desc" }, { status: "asc" }, { createdAt: "desc" }] });
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.post("/versions", validateBody(versionSchema), async (req, res, next) => {
  try {
    if (req.body.status === "latest") {
      await prisma.browserPluginVersion.updateMany({ where: { targetBrowser: req.body.targetBrowser }, data: { isLatest: false, status: "published" } });
    }
    const item = await prisma.browserPluginVersion.create({
      data: {
        version: req.body.version,
        browser: req.body.targetBrowser,
        targetBrowser: req.body.targetBrowser,
        releaseNotes: req.body.releaseNotes,
        minimumSupportedVersion: req.body.minimumSupportedVersion,
        severity: req.body.severity,
        status: req.body.status,
        rolloutRing: req.body.rolloutRing,
        isLatest: req.body.status === "latest",
        packagePath: req.body.packagePath,
        checksum: req.body.checksum,
        publishedAt: req.body.status === "draft" ? null : new Date(),
        createdByUserId: req.user!.id
      }
    });
    await auditLog({ organizationId: req.user!.organizationId, actorUserId: req.user!.id, action: "plugin_version.registered", entityType: "browser_plugin_version", entityId: item.id, details: { version: item.version, targetBrowser: item.targetBrowser, status: item.status } });
    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
});

router.post("/versions/:id/mark-latest", async (req, res, next) => {
  try {
    const existing = await prisma.browserPluginVersion.findUniqueOrThrow({ where: { id: req.params.id } });
    await prisma.browserPluginVersion.updateMany({ where: { targetBrowser: existing.targetBrowser, id: { not: existing.id }, status: "latest" }, data: { status: "published", isLatest: false } });
    const item = await prisma.browserPluginVersion.update({ where: { id: existing.id }, data: { status: "latest", isLatest: true, publishedAt: existing.publishedAt ?? new Date() } });
    await auditLog({ organizationId: req.user!.organizationId, actorUserId: req.user!.id, action: "plugin_version.marked_latest", entityType: "browser_plugin_version", entityId: item.id, details: { version: item.version } });
    res.json({ item });
  } catch (error) {
    next(error);
  }
});

router.post("/versions/:id/mark-required", async (req, res, next) => {
  try {
    const item = await prisma.browserPluginVersion.update({ where: { id: req.params.id }, data: { severity: "required", status: "latest", isLatest: true, publishedAt: new Date() } });
    await prisma.browserPluginVersion.updateMany({ where: { targetBrowser: item.targetBrowser, id: { not: item.id }, status: "latest" }, data: { status: "published", isLatest: false } });
    await auditLog({ organizationId: req.user!.organizationId, actorUserId: req.user!.id, action: "plugin_version.marked_required", entityType: "browser_plugin_version", entityId: item.id, details: { version: item.version } });
    res.json({ item });
  } catch (error) {
    next(error);
  }
});

router.post("/versions/:id/deprecate", async (req, res, next) => {
  try {
    const item = await prisma.browserPluginVersion.update({ where: { id: req.params.id }, data: { status: "deprecated", isLatest: false } });
    await auditLog({ organizationId: req.user!.organizationId, actorUserId: req.user!.id, action: "plugin_version.deprecated", entityType: "browser_plugin_version", entityId: item.id, details: { version: item.version } });
    res.json({ item });
  } catch (error) {
    next(error);
  }
});

router.post("/enrollment-token", validateBody(tokenSchema), async (req, res, next) => {
  try {
    await prisma.policy.findFirstOrThrow({ where: { id: req.body.policyId, status: "published", organizationId: req.body.organizationId } });
    const token = `enroll_${crypto.randomBytes(24).toString("hex")}`;
    const expiresAt = new Date(Date.now() + req.body.expiresInDays * 24 * 60 * 60 * 1000);
    const item = await prisma.enrollmentToken.create({
      data: {
        organizationId: req.body.organizationId,
        policyId: req.body.policyId,
        tokenHash: await bcrypt.hash(token, 12),
        targetBrowser: req.body.targetBrowser,
        expiresAt,
        createdByUserId: req.user!.id
      }
    });
    await auditLog({ organizationId: req.body.organizationId, actorUserId: req.user!.id, action: "browser_plugin.enrollment_token_created", entityType: "enrollment_token", entityId: item.id, details: { targetBrowser: req.body.targetBrowser, expiresAt: expiresAt.toISOString() } });
    res.status(201).json({ enrollmentToken: token, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    next(error);
  }
});

router.post("/package", validateBody(packageSchema), async (req, res, next) => {
  try {
    await prisma.policy.findFirstOrThrow({ where: { id: req.body.policyId, status: "published", organizationId: req.body.organizationId } });
    const token = `enroll_${crypto.randomBytes(24).toString("hex")}`;
    const expiresAt = new Date(Date.now() + req.body.enrollmentTokenExpiresInDays * 24 * 60 * 60 * 1000);
    await prisma.enrollmentToken.create({
      data: {
        organizationId: req.body.organizationId,
        policyId: req.body.policyId,
        tokenHash: await bcrypt.hash(token, 12),
        targetBrowser: req.body.targetBrowser,
        expiresAt,
        createdByUserId: req.user!.id
      }
    });
    const enrollment = {
      serverUrl: req.body.serverUrl,
      organizationId: req.body.organizationId,
      enrollmentToken: token,
      defaultPolicyId: req.body.policyId,
      pluginMode: "managed",
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString()
    };
    const zip = createZip(pluginFiles(enrollment, req.body.targetBrowser));
    res.setHeader("content-type", "application/zip");
    res.setHeader("content-disposition", `attachment; filename="ai-usage-guard-${req.body.targetBrowser}-browser-shield.zip"`);
    res.setHeader("x-package-checksum", checksum(zip));
    res.send(zip);
  } catch (error) {
    next(error);
  }
});

router.get("/deployment-status", async (_req, res, next) => {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const latest = await prisma.browserPluginVersion.findFirst({ where: { OR: [{ isLatest: true }, { status: "latest" }] }, orderBy: [{ isLatest: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }] });
    const [totalInstalls, activeLast24Hours, outdatedPlugins, updateRequired, missingPolicy, appliedPolicy, installs] = await Promise.all([
      prisma.browserPluginInstall.count(),
      prisma.browserPluginInstall.count({ where: { lastSeenAt: { gte: since24h } } }),
      prisma.browserPluginInstall.count({ where: { updateStatus: { in: ["update_available", "update_required", "pending_admin_deployment"] } } }),
      prisma.browserPluginInstall.count({ where: { updateStatus: "update_required" } }),
      prisma.browserPluginInstall.count({ where: { policyStatus: { in: ["unknown", "pending", "failed", "out_of_date"] } } }),
      prisma.browserPluginInstall.count({ where: { policyStatus: "applied" } }),
      prisma.browserPluginInstall.findMany({ include: { organization: true, endpoint: true }, orderBy: { lastSeenAt: "desc" }, take: 250 })
    ]);
    res.json({
      latestVersion: latest?.version ?? "0.7.1",
      minimumRequiredVersion: latest?.minimumSupportedVersion ?? null,
      totalInstalls,
      activeLast24Hours,
      outdatedPlugins,
      upToDatePlugins: totalInstalls - outdatedPlugins,
      updateRequired,
      missingPolicy,
      updateRolloutProgress: totalInstalls ? Math.round(((totalInstalls - outdatedPlugins) / totalInstalls) * 100) : 0,
      policySyncSuccessRate: totalInstalls ? Math.round((appliedPolicy / totalInstalls) * 100) : 0,
      installs
    });
  } catch (error) {
    next(error);
  }
});

router.get("/installs", async (_req, res, next) => {
  try {
    const items = await prisma.browserPluginInstall.findMany({ include: { organization: true, endpoint: true }, orderBy: { lastSeenAt: "desc" }, take: 250 });
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.post("/rollouts", validateBody(rolloutSchema), async (req, res, next) => {
  try {
    const item = await prisma.pluginRollout.create({
      data: {
        organizationId: req.body.organizationId,
        pluginVersionId: req.body.pluginVersionId,
        rolloutName: req.body.rolloutName,
        rolloutRing: req.body.rolloutRing,
        targetType: req.body.targetType,
        targetId: req.body.targetId,
        status: req.body.status,
        createdByUserId: req.user!.id
      }
    });
    await auditLog({ organizationId: item.organizationId, actorUserId: req.user!.id, action: "plugin_rollout.started", entityType: "plugin_rollout", entityId: item.id, details: { rolloutName: item.rolloutName, rolloutRing: item.rolloutRing, targetType: item.targetType, targetId: item.targetId } });
    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
});

router.get("/rollouts/:id/status", async (req, res, next) => {
  try {
    const rollout = await prisma.pluginRollout.findUniqueOrThrow({ where: { id: req.params.id }, include: { pluginVersion: true } });
    const installWhere = rollout.targetType === "endpoint" && rollout.targetId
      ? { endpointId: rollout.targetId }
      : { organizationId: rollout.organizationId };
    const installs = await prisma.browserPluginInstall.findMany({ where: installWhere, include: { endpoint: true, organization: true }, orderBy: { lastSeenAt: "desc" } });
    const notices = await prisma.pluginUpdateNotice.findMany({ where: { pluginVersionId: rollout.pluginVersionId, organizationId: rollout.organizationId } });
    res.json({
      item: rollout,
      summary: {
        targeted: installs.length,
        upToDate: installs.filter((item) => item.pluginVersion === rollout.pluginVersion.version || item.updateStatus === "up_to_date").length,
        updateAvailable: installs.filter((item) => item.updateStatus === "update_available").length,
        updateRequired: installs.filter((item) => item.updateStatus === "update_required").length,
        pendingAdminDeployment: installs.filter((item) => item.updateStatus === "pending_admin_deployment").length,
        failed: installs.filter((item) => item.updateStatus === "failed").length,
        noticesSeen: notices.filter((item) => ["seen", "acknowledged", "completed"].includes(item.status)).length,
        completed: notices.filter((item) => item.status === "completed").length
      },
      installs,
      notices
    });
  } catch (error) {
    next(error);
  }
});

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" }[char] || char));
}

export default router;
