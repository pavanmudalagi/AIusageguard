import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { auditLog } from "../../middleware/audit";

const router = Router();
router.use(requireAuth);

const templateSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1).max(200),
  type: z.enum(["email", "education_blog", "user_coaching", "notification"]),
  category: z.string().max(120).nullable().optional(),
  subject: z.string().max(240).nullable().optional(),
  body: z.string().min(1).max(20000),
  variables: z.array(z.string()).default([]),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  version: z.string().default("1.0")
});

router.get("/", async (req, res, next) => {
  try {
    const items = await prisma.emailTemplate.findMany({
      where: {
        ...(req.query.organizationId ? { organizationId: String(req.query.organizationId) } : {}),
        ...(req.query.type ? { type: String(req.query.type) as never } : {}),
        ...(req.query.status ? { status: String(req.query.status) as never } : {})
      },
      orderBy: { updatedAt: "desc" }
    });
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.post("/", validateBody(templateSchema), async (req, res, next) => {
  try {
    const item = await prisma.emailTemplate.create({ data: { ...req.body, createdByUserId: req.user!.id, publishedAt: req.body.status === "published" ? new Date() : null } });
    await auditLog({ organizationId: item.organizationId, actorUserId: req.user!.id, action: "template.created", entityType: "email_template", entityId: item.id });
    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    res.json({ item: await prisma.emailTemplate.findUniqueOrThrow({ where: { id: req.params.id } }) });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", validateBody(templateSchema.partial()), async (req, res, next) => {
  try {
    const item = await prisma.emailTemplate.update({ where: { id: req.params.id }, data: req.body });
    await auditLog({ organizationId: item.organizationId, actorUserId: req.user!.id, action: "template.updated", entityType: "email_template", entityId: item.id });
    res.json({ item });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/publish", async (req, res, next) => {
  try {
    const item = await prisma.emailTemplate.update({ where: { id: req.params.id }, data: { status: "published", publishedAt: new Date() } });
    await auditLog({ organizationId: item.organizationId, actorUserId: req.user!.id, action: "template.published", entityType: "email_template", entityId: item.id });
    res.json({ item });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/archive", async (req, res, next) => {
  try {
    const item = await prisma.emailTemplate.update({ where: { id: req.params.id }, data: { status: "archived" } });
    await auditLog({ organizationId: item.organizationId, actorUserId: req.user!.id, action: "template.archived", entityType: "email_template", entityId: item.id });
    res.json({ item });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/duplicate", async (req, res, next) => {
  try {
    const existing = await prisma.emailTemplate.findUniqueOrThrow({ where: { id: req.params.id } });
    const item = await prisma.emailTemplate.create({
      data: {
        organizationId: existing.organizationId,
        name: `${existing.name} Copy`,
        type: existing.type,
        category: existing.category,
        subject: existing.subject,
        body: existing.body,
        variables: existing.variables,
        version: "1.0",
        status: "draft",
        createdByUserId: req.user!.id
      }
    });
    await auditLog({ organizationId: item.organizationId, actorUserId: req.user!.id, action: "template.duplicated", entityType: "email_template", entityId: item.id, details: { sourceTemplateId: existing.id } });
    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
});

export default router;
