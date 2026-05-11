import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { auditLog } from "../../middleware/audit";

const router = Router();
router.use(requireAuth);

const alertSchema = z.object({
  organizationId: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  status: z.enum(["open", "investigating", "resolved", "dismissed"]).default("open"),
  sourceEventId: z.string().nullable().optional(),
  endpointId: z.string().nullable().optional(),
  genAIAppName: z.string().max(160).nullable().optional(),
  detectedCategories: z.array(z.string()).default([])
});
const statusSchema = z.object({
  status: z.enum(["open", "investigating", "resolved", "dismissed"]),
  resolutionNote: z.string().max(2000).nullable().optional()
});
const commentSchema = z.object({ comment: z.string().min(1).max(2000) });
const assignSchema = z.object({ assignedToUserId: z.string().nullable() });

router.get("/", async (req, res, next) => {
  try {
    const where = {
      ...(req.query.organizationId ? { organizationId: String(req.query.organizationId) } : {}),
      ...(req.query.status ? { status: String(req.query.status) as never } : {}),
      ...(req.query.severity ? { severity: String(req.query.severity) as never } : {})
    };
    const items = await prisma.alert.findMany({ where, include: { comments: true }, orderBy: { createdAt: "desc" }, take: 200 });
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.post("/", validateBody(alertSchema), async (req, res, next) => {
  try {
    const item = await prisma.alert.create({ data: req.body });
    await auditLog({ organizationId: item.organizationId, actorUserId: req.user!.id, action: "alert.created", entityType: "alert", entityId: item.id, details: { severity: item.severity } });
    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    res.json({ item: await prisma.alert.findUniqueOrThrow({ where: { id: req.params.id }, include: { comments: true } }) });
  } catch (error) {
    next(error);
  }
});

router.put("/:id/status", validateBody(statusSchema), async (req, res, next) => {
  try {
    const item = await prisma.alert.update({
      where: { id: req.params.id },
      data: {
        status: req.body.status,
        resolutionNote: req.body.resolutionNote,
        resolvedByUserId: ["resolved", "dismissed"].includes(req.body.status) ? req.user!.id : null,
        resolvedAt: ["resolved", "dismissed"].includes(req.body.status) ? new Date() : null
      }
    });
    await auditLog({ organizationId: item.organizationId, actorUserId: req.user!.id, action: "alert.status_changed", entityType: "alert", entityId: item.id, details: { status: item.status } });
    res.json({ item });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/comments", validateBody(commentSchema), async (req, res, next) => {
  try {
    const alert = await prisma.alert.findUniqueOrThrow({ where: { id: req.params.id } });
    const item = await prisma.alertComment.create({ data: { alertId: alert.id, userId: req.user!.id, comment: req.body.comment } });
    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
});

router.put("/:id/assign", validateBody(assignSchema), async (req, res, next) => {
  try {
    const item = await prisma.alert.update({ where: { id: req.params.id }, data: { assignedToUserId: req.body.assignedToUserId } });
    await auditLog({ organizationId: item.organizationId, actorUserId: req.user!.id, action: "alert.assigned", entityType: "alert", entityId: item.id, details: { assignedToUserId: item.assignedToUserId } });
    res.json({ item });
  } catch (error) {
    next(error);
  }
});

export default router;
