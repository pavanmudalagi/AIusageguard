import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, orgWhereForUser, assertOrgAccess } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { auditLog } from "../../middleware/audit";

const router = Router();
const orgSchema = z.object({
  name: z.string().min(1).max(160),
  type: z.enum(["msp", "customer"]),
  parentOrgId: z.string().nullable().optional()
});
const orgSettingsSchema = z.object({
  defaultPolicyId: z.string().nullable().optional(),
  uiTheme: z.enum(["light", "dark", "system"]).optional(),
  dataRetentionDays: z.number().int().min(1).max(3650).optional(),
  eventRetentionDays: z.number().int().min(1).max(3650).optional(),
  alertRetentionDays: z.number().int().min(1).max(3650).optional(),
  auditLogRetentionDays: z.number().int().min(1).max(3650).optional(),
  reportCleanPromptScans: z.boolean().optional(),
  reportSensitiveEvents: z.boolean().optional(),
  notificationSettings: z.record(z.unknown()).nullable().optional(),
  smtpEnabled: z.boolean().optional(),
  smtpHostEncrypted: z.string().nullable().optional(),
  smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
  smtpUserEncrypted: z.string().nullable().optional(),
  smtpPasswordEncrypted: z.string().nullable().optional(),
  webhookEnabled: z.boolean().optional(),
  webhookUrlEncrypted: z.string().nullable().optional()
});

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const orgs = await prisma.organization.findMany({ where: orgWhereForUser(req.user!), orderBy: { name: "asc" } });
    res.json({ items: orgs });
  } catch (error) {
    next(error);
  }
});

router.post("/", validateBody(orgSchema), async (req, res, next) => {
  try {
    const org = await prisma.organization.create({
      data: {
        ...req.body,
        enrollmentTokenHash: await bcrypt.hash(`${req.body.name}-enrollment-token`, 12)
      }
    });
    await auditLog({ organizationId: org.id, actorUserId: req.user!.id, action: "organization.created", entityType: "organization", entityId: org.id });
    res.status(201).json({ item: org });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    assertOrgAccess(req.user!, req.params.id);
    res.json({ item: await prisma.organization.findUniqueOrThrow({ where: { id: req.params.id } }) });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/settings", async (req, res, next) => {
  try {
    assertOrgAccess(req.user!, req.params.id);
    const item = await prisma.organizationSettings.upsert({
      where: { organizationId: req.params.id },
      update: {},
      create: { organizationId: req.params.id }
    });
    res.json({ item });
  } catch (error) {
    next(error);
  }
});

router.put("/:id/settings", validateBody(orgSettingsSchema), async (req, res, next) => {
  try {
    assertOrgAccess(req.user!, req.params.id);
    const item = await prisma.organizationSettings.upsert({
      where: { organizationId: req.params.id },
      update: req.body,
      create: { organizationId: req.params.id, ...req.body }
    });
    await auditLog({ organizationId: req.params.id, actorUserId: req.user!.id, action: "organization_settings.changed", entityType: "organization_settings", entityId: item.id, details: { keys: Object.keys(req.body) } });
    res.json({ item });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", validateBody(orgSchema.partial()), async (req, res, next) => {
  try {
    assertOrgAccess(req.user!, req.params.id);
    const org = await prisma.organization.update({ where: { id: req.params.id }, data: req.body });
    await auditLog({ organizationId: org.id, actorUserId: req.user!.id, action: "organization.updated", entityType: "organization", entityId: org.id });
    res.json({ item: org });
  } catch (error) {
    next(error);
  }
});

export default router;
