import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";

const router = Router();
router.use(requireAuth);

const preferencesSchema = z.object({
  themePreference: z.enum(["light", "dark", "system"]).optional(),
  notificationPreferences: z.record(z.unknown()).nullable().optional(),
  dashboardPreferences: z.record(z.unknown()).nullable().optional()
});

router.get("/me/preferences", async (req, res, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
      select: { themePreference: true, notificationPreferences: true, dashboardPreferences: true }
    });
    res.json({ item: user });
  } catch (error) {
    next(error);
  }
});

router.put("/me/preferences", validateBody(preferencesSchema), async (req, res, next) => {
  try {
    const item = await prisma.user.update({
      where: { id: req.user!.id },
      data: req.body,
      select: { themePreference: true, notificationPreferences: true, dashboardPreferences: true }
    });
    res.json({ item });
  } catch (error) {
    next(error);
  }
});

export default router;
