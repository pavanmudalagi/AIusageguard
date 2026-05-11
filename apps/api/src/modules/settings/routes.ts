import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { auditLog } from "../../middleware/audit";

const router = Router();
router.use(requireAuth);

const appSettingsSchema = z.record(z.unknown());
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

router.get("/", async (_req, res, next) => {
  try {
    const items = await prisma.appSetting.findMany({ orderBy: { key: "asc" } });
    res.json({ item: Object.fromEntries(items.map((setting) => [setting.key, setting.value])) });
  } catch (error) {
    next(error);
  }
});

router.put("/", validateBody(appSettingsSchema), async (req, res, next) => {
  try {
    await Promise.all(Object.entries(req.body).map(([key, value]) => prisma.appSetting.upsert({
      where: { key },
      update: { value: value as never, updatedBy: req.user!.id },
      create: { key, value: value as never, updatedBy: req.user!.id }
    })));
    await auditLog({ organizationId: req.user!.organizationId, actorUserId: req.user!.id, action: "settings.changed", entityType: "app_settings", entityId: "global", details: { keys: Object.keys(req.body) } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/orgs/:id", async (req, res, next) => {
  try {
    res.json({ item: await getOrCreateOrgSettings(req.params.id) });
  } catch (error) {
    next(error);
  }
});

router.put("/orgs/:id", validateBody(orgSettingsSchema), async (req, res, next) => {
  try {
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

async function getOrCreateOrgSettings(organizationId: string) {
  return prisma.organizationSettings.upsert({
    where: { organizationId },
    update: {},
    create: { organizationId }
  });
}

export default router;
