import { Router } from "express";
import { z } from "zod";
import { policyWithIdentity } from "@ai-usage-guard/shared";
import { prisma } from "../../config/prisma";
import { requireAuth, requireEndpointToken } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";

const router = Router();
const checkInSchema = z.object({
  organizationId: z.string().min(1),
  deviceId: z.string().min(1),
  hostname: z.string().min(1).max(255).optional(),
  machineName: z.string().min(1).max(255).optional(),
  os: z.string().min(1).max(64).default("browser"),
  osVersion: z.string().max(64).optional(),
  browser: z.enum(["chrome", "edge"]).optional(),
  browserVersion: z.string().max(64).optional(),
  browserExtensionVersion: z.string().max(64).optional(),
  pluginVersion: z.string().max(64).optional(),
  localAgentVersion: z.string().max(64).optional(),
  currentPolicyId: z.string().optional(),
  currentPolicyVersion: z.string().optional(),
  lastPolicyAppliedAt: z.string().datetime().optional()
});
const policyStatusSchema = z.object({
  organizationId: z.string().min(1).optional(),
  deviceId: z.string().min(1),
  policyId: z.string().min(1),
  policyVersion: z.string().min(1),
  status: z.enum(["pending", "delivered", "applied", "failed", "outdated"]),
  appliedAt: z.string().datetime().nullable().optional(),
  errorMessage: z.string().max(1000).nullable().optional()
});

router.post("/check-in", requireEndpointToken, validateBody(checkInSchema), async (req, res, next) => {
  try {
    const machineName = req.body.machineName ?? req.body.hostname ?? "browser-extension-host";
    const pluginVersion = req.body.pluginVersion ?? req.body.browserExtensionVersion;
    const endpoint = await prisma.endpoint.upsert({
      where: { organizationId_deviceId: { organizationId: req.body.organizationId, deviceId: req.body.deviceId } },
      update: {
        hostname: machineName,
        os: req.body.os,
        osVersion: req.body.osVersion ?? req.body.browserVersion,
        browser: req.body.browser,
        browserVersion: req.body.browserVersion,
        browserExtensionVersion: pluginVersion,
        localAgentVersion: req.body.localAgentVersion,
        lastSeenAt: new Date()
      },
      create: {
        organizationId: req.body.organizationId,
        deviceId: req.body.deviceId,
        hostname: machineName,
        os: req.body.os,
        osVersion: req.body.osVersion ?? req.body.browserVersion,
        browser: req.body.browser,
        browserVersion: req.body.browserVersion,
        browserExtensionVersion: pluginVersion,
        localAgentVersion: req.body.localAgentVersion,
        lastSeenAt: new Date(),
        policyStatus: "pending"
      }
    });
    const policy = await resolvePolicy(req.body.organizationId, endpoint.id);
    const policyUpdateAvailable = Boolean(policy && (policy.id !== req.body.currentPolicyId || policy.version !== req.body.currentPolicyVersion));
    if (policy) {
      await prisma.policyDelivery.upsert({
        where: { id: `${policy.id}:${endpoint.id}:${policy.version}` },
        update: { deliveryStatus: "delivered", deliveredAt: new Date() },
        create: {
          id: `${policy.id}:${endpoint.id}:${policy.version}`,
          policyId: policy.id,
          endpointId: endpoint.id,
          policyVersion: policy.version,
          deliveryStatus: "delivered",
          deliveredAt: new Date()
        }
      });
      await prisma.endpoint.update({ where: { id: endpoint.id }, data: { currentPolicyId: policy.id, currentPolicyVersion: policy.version, policyStatus: policyUpdateAvailable ? "delivered" : endpoint.policyStatus } });
    }
    const pluginUpdate = req.body.browser && pluginVersion
      ? await resolvePluginUpdate(req.body.organizationId, endpoint.id, req.body.browser, pluginVersion, req)
      : null;
    await prisma.endpoint.update({
      where: { id: endpoint.id },
      data: {
        latestPluginVersion: pluginUpdate?.latestVersion,
        pluginUpdateStatus: pluginUpdate ? (pluginUpdate.severity === "required" ? "update_required" : "update_available") : "up_to_date"
      }
    });
    if (req.body.browser && pluginVersion) {
      await prisma.browserPluginInstall.upsert({
        where: { organizationId_deviceId_browser: { organizationId: req.body.organizationId, deviceId: req.body.deviceId, browser: req.body.browser } },
        update: {
          endpointId: endpoint.id,
          machineName,
          browserVersion: req.body.browserVersion,
          pluginVersion,
          latestAvailableVersion: pluginUpdate?.latestVersion,
          installStatus: pluginUpdate ? "outdated" : "active",
          updateStatus: pluginUpdate ? (pluginUpdate.severity === "required" ? "update_required" : "update_available") : "up_to_date",
          lastSeenAt: new Date(),
          currentPolicyId: policy?.id ?? req.body.currentPolicyId,
          currentPolicyVersion: policy?.version ?? req.body.currentPolicyVersion,
          policyStatus: policyUpdateAvailable ? "delivered" : endpoint.policyStatus
        },
        create: {
          organizationId: req.body.organizationId,
          endpointId: endpoint.id,
          deviceId: req.body.deviceId,
          machineName,
          browser: req.body.browser,
          browserVersion: req.body.browserVersion,
          pluginVersion,
          latestAvailableVersion: pluginUpdate?.latestVersion,
          installStatus: pluginUpdate ? "outdated" : "active",
          updateStatus: pluginUpdate ? (pluginUpdate.severity === "required" ? "update_required" : "update_available") : "up_to_date",
          lastSeenAt: new Date(),
          currentPolicyId: policy?.id ?? req.body.currentPolicyId,
          currentPolicyVersion: policy?.version ?? req.body.currentPolicyVersion,
          policyStatus: policyUpdateAvailable ? "delivered" : "unknown"
        }
      });
    }
    res.json({
      endpointId: endpoint.id,
      serverTime: new Date().toISOString(),
      policyUpdateAvailable,
      policy: policy ? { policyId: policy.id, policyName: policy.name, policyVersion: policy.version, policyJson: policyWithIdentity(policy.policyJson, { policyId: policy.id, policyName: policy.name, policyVersion: policy.version }) } : null,
      pluginUpdateAvailable: Boolean(pluginUpdate),
      pluginUpdate,
      nextCheckInSeconds: Number(policy?.policyJson && typeof policy.policyJson === "object" && "sync" in policy.policyJson ? (policy.policyJson as any).sync?.nextCheckInSeconds : undefined) || 300
    });
  } catch (error) {
    next(error);
  }
});

router.post("/policy-status", requireEndpointToken, validateBody(policyStatusSchema), async (req, res, next) => {
  try {
    const endpoint = await prisma.endpoint.findUniqueOrThrow({
      where: { organizationId_deviceId: { organizationId: req.endpointAuthOrgId!, deviceId: req.body.deviceId } }
    });
    await prisma.policyDelivery.updateMany({
      where: { endpointId: endpoint.id, policyId: req.body.policyId, policyVersion: req.body.policyVersion },
      data: {
        deliveryStatus: req.body.status,
        appliedAt: req.body.status === "applied" ? (req.body.appliedAt ? new Date(req.body.appliedAt) : new Date()) : undefined,
        errorMessage: req.body.errorMessage ?? null
      }
    });
    await prisma.endpoint.update({ where: { id: endpoint.id }, data: { currentPolicyId: req.body.policyId, currentPolicyVersion: req.body.policyVersion, policyStatus: req.body.status === "outdated" ? "out_of_date" : req.body.status } });
    await prisma.browserPluginInstall.updateMany({
      where: { organizationId: req.endpointAuthOrgId!, deviceId: req.body.deviceId },
      data: { currentPolicyId: req.body.policyId, currentPolicyVersion: req.body.policyVersion, policyStatus: req.body.status === "outdated" ? "out_of_date" : req.body.status }
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1);
    const pageSize = Math.min(Number(req.query.pageSize ?? 25), 100);
    const where = req.query.organizationId ? { organizationId: String(req.query.organizationId) } : {};
    const [items, total] = await Promise.all([
      prisma.endpoint.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { lastSeenAt: "desc" }, include: { events: { take: 1, orderBy: { createdAt: "desc" } } } }),
      prisma.endpoint.count({ where })
    ]);
    res.json({ items, page, pageSize, total });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    res.json({ item: await prisma.endpoint.findUniqueOrThrow({ where: { id: req.params.id }, include: { users: true, events: { take: 20, orderBy: { createdAt: "desc" } } } }) });
  } catch (error) {
    next(error);
  }
});

async function resolvePolicy(organizationId: string, endpointId: string) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  const assignment = await prisma.policyAssignment.findFirst({
    where: {
      organizationId: { in: [organizationId, org?.parentOrgId].filter(Boolean) as string[] },
      policy: { status: "published" },
      OR: [
        { assignmentType: "endpoint", assignmentTargetId: endpointId },
        { assignmentType: "organization", assignmentTargetId: organizationId },
        { assignmentType: "organization", assignmentTargetId: null }
      ]
    },
    include: { policy: true },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }]
  });
  return assignment?.policy ?? prisma.policy.findFirst({ where: { organizationId: { in: [organizationId, org?.parentOrgId].filter(Boolean) as string[] }, status: "published" }, orderBy: { publishedAt: "desc" } });
}

async function resolvePluginUpdate(organizationId: string, endpointId: string, browser: "chrome" | "edge", currentVersion: string, req: any) {
  const latest = await prisma.browserPluginVersion.findFirst({
    where: { targetBrowser: browser, status: { in: ["latest", "published"] }, OR: [{ isLatest: true }, { status: "latest" }] },
    orderBy: [{ isLatest: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }]
  });
  if (!latest) return null;
  const rollout = await prisma.pluginRollout.findFirst({
    where: {
      organizationId,
      pluginVersionId: latest.id,
      status: "active",
      OR: [
        { targetType: "organization", targetId: organizationId },
        { targetType: "organization", targetId: null },
        { targetType: "endpoint", targetId: endpointId }
      ]
    }
  });
  const shouldNotify = rollout || latest.rolloutRing === "full";
  if (!shouldNotify || compareVersions(currentVersion, latest.version) >= 0) return null;
  await prisma.pluginUpdateNotice.upsert({
    where: { endpointId_pluginVersionId: { endpointId, pluginVersionId: latest.id } },
    update: { status: "seen" },
    create: { organizationId, endpointId, pluginVersionId: latest.id, status: "pending" }
  });
  const severity = latest.minimumSupportedVersion && compareVersions(currentVersion, latest.minimumSupportedVersion) < 0 ? "required" : latest.severity;
  return {
    latestVersion: latest.version,
    minimumRequiredVersion: latest.minimumSupportedVersion,
    severity,
    releaseNotes: latest.releaseNotes,
    downloadUrl: `${req.protocol}://${req.get("host")}/api/v1/browser-plugin/download/${encodeURIComponent(latest.version)}`,
    managedDeploymentRecommended: true,
    adminDeploymentRequired: true,
    checksum: latest.checksum
  };
}

function compareVersions(left: string, right: string) {
  const a = left.split(/[.-]/).map((part) => Number(part) || 0);
  const b = right.split(/[.-]/).map((part) => Number(part) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] ?? 0) > (b[index] ?? 0)) return 1;
    if ((a[index] ?? 0) < (b[index] ?? 0)) return -1;
  }
  return 0;
}

export default router;
