import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { aiUsageGuardPolicySchema, defaultPolicyJson, policyWithIdentity } from "@ai-usage-guard/shared";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { auditLog } from "../../middleware/audit";

const router = Router();
router.use(requireAuth);

const policyCreateSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1).max(160),
  description: z.string().max(1000).optional().nullable(),
  policyJson: aiUsageGuardPolicySchema.default(defaultPolicyJson)
});
const policyUpdateSchema = policyCreateSchema.partial().extend({
  policyJson: aiUsageGuardPolicySchema.optional()
});
const assignSchema = z.object({
  assignmentType: z.enum(["organization", "device_group", "user_group", "endpoint"]),
  organizationId: z.string(),
  targetId: z.string().nullable().optional(),
  assignmentTargetId: z.string().nullable().optional(),
  applyImmediately: z.boolean().default(true),
  priority: z.number().int().default(100)
});

router.get("/", async (req, res, next) => {
  try {
    const search = String(req.query.search ?? "").trim();
    const where: Prisma.PolicyWhereInput = {
      ...(req.query.organizationId ? { organizationId: String(req.query.organizationId) } : {}),
      ...(req.query.status ? { status: String(req.query.status) as never } : {}),
      ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }] } : {})
    };
    const policies = await prisma.policy.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: { assignments: true, deliveries: true }
    });
    res.json({ items: policies.map(policyResponse) });
  } catch (error) {
    next(error);
  }
});

router.post("/", validateBody(policyCreateSchema), async (req, res, next) => {
  try {
    const version = nextVersion();
    const policy = await prisma.policy.create({
      data: {
        organizationId: req.body.organizationId,
        name: req.body.name,
        description: req.body.description,
        version,
        status: "draft",
        mode: String((req.body.policyJson as any).mode ?? "active"),
        policyJson: withIdentity(req.body.policyJson, { policyName: req.body.name, policyVersion: version }),
        createdByUserId: req.user!.id
      }
    });
    await auditLog({ organizationId: policy.organizationId, actorUserId: req.user!.id, action: "policy.created", entityType: "policy", entityId: policy.id });
    res.status(201).json({ item: policyResponse(policy) });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const policy = await prisma.policy.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        assignments: true,
        deliveries: { include: { endpoint: true }, orderBy: { deliveredAt: "desc" } }
      }
    });
    const recentEvents = await prisma.usageEvent.findMany({ where: { policyId: policy.id }, include: { endpoint: true }, orderBy: { createdAt: "desc" }, take: 25 });
    res.json({ item: { ...policyResponse(policy), recentEvents } });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", validateBody(policyUpdateSchema), async (req, res, next) => {
  try {
    const existing = await prisma.policy.findUniqueOrThrow({ where: { id: req.params.id } });
    if (existing.status === "archived") return res.status(409).json({ error: "Archived policies are read-only" });

    const name = req.body.name ?? existing.name;
    const version = nextVersion();
    const policyJson = withIdentity(req.body.policyJson ?? existing.policyJson, { policyName: name, policyVersion: version });
    const data = {
      organizationId: req.body.organizationId ?? existing.organizationId,
      name,
      description: req.body.description === undefined ? existing.description : req.body.description,
      version,
      status: "draft" as const,
      mode: String((policyJson as any).mode ?? "active"),
      policyJson
    };

    const policy = existing.status === "published"
      ? await prisma.policy.create({ data: { ...data, createdByUserId: req.user!.id } })
      : await prisma.policy.update({ where: { id: existing.id }, data });
    await auditLog({
      organizationId: policy.organizationId,
      actorUserId: req.user!.id,
      action: existing.status === "published" ? "policy.draft_created_from_published" : "policy.updated",
      entityType: "policy",
      entityId: policy.id,
      details: { sourcePolicyId: existing.id }
    });
    res.json({ item: policyResponse(policy) });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/publish", async (req, res, next) => {
  try {
    const existing = await prisma.policy.findUniqueOrThrow({ where: { id: req.params.id } });
    if (existing.status === "archived") return res.status(409).json({ error: "Archived policies cannot be published" });
    const version = nextVersion();
    const policy = await prisma.policy.update({
      where: { id: req.params.id },
      data: { status: "published", publishedAt: new Date(), version, mode: String((existing.policyJson as any).mode ?? existing.mode ?? "active"), policyJson: withIdentity(existing.policyJson, { policyName: existing.name, policyVersion: version }) }
    });
    await createPendingDeliveries(policy.id, policy.organizationId, policy.version);
    await auditLog({ organizationId: policy.organizationId, actorUserId: req.user!.id, action: "policy.published", entityType: "policy", entityId: policy.id, details: { version: policy.version } });
    res.json({ item: policyResponse(policy) });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/archive", async (req, res, next) => {
  try {
    const policy = await prisma.policy.update({ where: { id: req.params.id }, data: { status: "archived" } });
    await auditLog({ organizationId: policy.organizationId, actorUserId: req.user!.id, action: "policy.archived", entityType: "policy", entityId: policy.id });
    res.json({ item: policyResponse(policy) });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/duplicate", async (req, res, next) => {
  try {
    const existing = await prisma.policy.findUniqueOrThrow({ where: { id: req.params.id } });
    const version = nextVersion();
    const copy = await prisma.policy.create({
      data: {
        organizationId: existing.organizationId,
        name: `${existing.name} Copy`,
        description: existing.description,
        version,
        status: "draft",
        mode: String((existing.policyJson as any).mode ?? "active"),
        policyJson: withIdentity(existing.policyJson, { policyName: `${existing.name} Copy`, policyVersion: version }),
        createdByUserId: req.user!.id
      }
    });
    await auditLog({ organizationId: copy.organizationId, actorUserId: req.user!.id, action: "policy.duplicated", entityType: "policy", entityId: copy.id, details: { sourcePolicyId: existing.id } });
    res.status(201).json({ item: policyResponse(copy) });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/assign", validateBody(assignSchema), async (req, res, next) => {
  try {
    const policy = await prisma.policy.findUniqueOrThrow({ where: { id: req.params.id } });
    if (policy.status !== "published") return res.status(409).json({ error: "Only published policies can be assigned" });
    const assignmentTargetId = req.body.assignmentTargetId ?? req.body.targetId ?? (req.body.assignmentType === "organization" ? null : undefined);
    const assignment = await prisma.policyAssignment.create({
      data: { policyId: policy.id, organizationId: req.body.organizationId, assignmentType: req.body.assignmentType, assignmentTargetId, priority: req.body.priority }
    });
    await createPendingDeliveries(policy.id, req.body.organizationId, policy.version, req.body.assignmentType, assignmentTargetId ?? null, req.body.applyImmediately);
    await auditLog({ organizationId: req.body.organizationId, actorUserId: req.user!.id, action: "policy.assigned", entityType: "policy", entityId: policy.id, details: { assignmentId: assignment.id, assignmentType: assignment.assignmentType, assignmentTargetId: assignment.assignmentTargetId } });
    res.status(201).json({ item: assignment });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/delivery-status", async (req, res, next) => {
  try {
    const items = await prisma.policyDelivery.findMany({ where: { policyId: req.params.id }, include: { endpoint: true }, orderBy: { deliveredAt: "desc" } });
    res.json({
      items,
      summary: {
        pending: items.filter((item) => item.deliveryStatus === "pending").length,
        delivered: items.filter((item) => item.deliveryStatus === "delivered").length,
        applied: items.filter((item) => item.deliveryStatus === "applied").length,
        failed: items.filter((item) => item.deliveryStatus === "failed").length,
        outdated: items.filter((item) => item.deliveryStatus === "outdated").length
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/retry-sync", async (req, res, next) => {
  try {
    const policy = await prisma.policy.findUniqueOrThrow({ where: { id: req.params.id } });
    const failed = await prisma.policyDelivery.findMany({ where: { policyId: policy.id, deliveryStatus: "failed" } });
    await prisma.policyDelivery.updateMany({
      where: { policyId: policy.id, deliveryStatus: "failed" },
      data: { deliveryStatus: "pending", deliveredAt: null, appliedAt: null, errorMessage: null }
    });
    await prisma.endpoint.updateMany({
      where: { id: { in: failed.map((item) => item.endpointId) } },
      data: { currentPolicyId: policy.id, currentPolicyVersion: policy.version, policyStatus: "pending" }
    });
    await auditLog({ organizationId: policy.organizationId, actorUserId: req.user!.id, action: "policy.sync_retried", entityType: "policy", entityId: policy.id, details: { retriedEndpoints: failed.length } });
    res.json({ ok: true, retriedEndpoints: failed.length });
  } catch (error) {
    next(error);
  }
});

function nextVersion() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll("-", ".");
  return `${date}.${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}`;
}

async function createPendingDeliveries(policyId: string, organizationId: string, policyVersion: string, assignmentType = "organization", assignmentTargetId: string | null = null, updateEndpoint = true) {
  const endpoints = await prisma.endpoint.findMany({
    where: assignmentType === "endpoint" && assignmentTargetId ? { id: assignmentTargetId } : { organizationId }
  });
  for (const endpoint of endpoints) {
    await prisma.policyDelivery.upsert({
      where: { id: `${policyId}:${endpoint.id}:${policyVersion}` },
      update: { deliveryStatus: "pending", deliveredAt: null, appliedAt: null, errorMessage: null },
      create: { id: `${policyId}:${endpoint.id}:${policyVersion}`, policyId, endpointId: endpoint.id, policyVersion, deliveryStatus: "pending" }
    });
    if (updateEndpoint) {
      await prisma.endpoint.update({ where: { id: endpoint.id }, data: { currentPolicyId: policyId, currentPolicyVersion: policyVersion, policyStatus: "pending" } });
    }
  }
}

function withIdentity(policyJson: unknown, identity: { policyName: string; policyVersion: string }) {
  const policy = policyWithIdentity(policyJson, { policyId: "pending", ...identity });
  delete policy.policyId;
  return policy as Prisma.InputJsonValue;
}

function policyResponse(policy: any) {
  const policyJson = policyWithIdentity(policy.policyJson, { policyId: policy.id, policyName: policy.name, policyVersion: policy.version });
  const deliveries = policy.deliveries ?? [];
  return {
    ...policy,
    policyJson,
    mode: policyJson.mode,
    assignedScopeCount: policy.assignments?.length ?? 0,
    deliverySummary: {
      pending: deliveries.filter((item: any) => item.deliveryStatus === "pending").length,
      delivered: deliveries.filter((item: any) => item.deliveryStatus === "delivered").length,
      applied: deliveries.filter((item: any) => item.deliveryStatus === "applied").length,
      failed: deliveries.filter((item: any) => item.deliveryStatus === "failed").length
    }
  };
}

export default router;
