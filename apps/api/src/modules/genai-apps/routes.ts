import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { auditLog } from "../../middleware/audit";

const router = Router();
router.use(requireAuth);

router.get("/", async (_req, res, next) => {
  try {
    const items = await prisma.genAIApplication.findMany({ orderBy: { updatedAt: "desc" } });
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.post("/", validateBody(z.object({
  name: z.string().min(1),
  appType: z.enum(["browser", "desktop", "browser_and_desktop"]),
  domain: z.string().optional(),
  executableName: z.string().optional(),
  riskRating: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  approvedStatus: z.enum(["approved", "restricted", "blocked", "unknown"]).default("unknown")
})), async (req, res, next) => {
  try {
    const item = await prisma.genAIApplication.create({ data: req.body });
    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const item = await prisma.genAIApplication.findUniqueOrThrow({ where: { id: req.params.id } });
    const events = await prisma.usageEvent.findMany({ where: { genAIApplicationId: req.params.id }, include: { endpoint: true, endpointUser: true }, orderBy: { createdAt: "desc" }, take: 1000 });
    res.json({
      item,
      metrics: {
        endpointCount: new Set(events.map((event) => event.endpointId)).size,
        userCount: new Set(events.map((event) => event.endpointUser?.userIdentifierHash).filter(Boolean)).size,
        totalDetections: events.filter((event) => event.eventType === "genai_app_detected").length,
        usageCount: events.filter((event) => ["genai_app_used", "genai_app_detected"].includes(event.eventType)).length,
        promptScanCount: events.filter((event) => event.eventType === "prompt_scanned").length,
        sensitivePromptCount: events.filter((event) => ["sensitive_prompt_detected", "prompt_blocked", "prompt_warned"].includes(event.eventType)).length,
        fileScanCount: events.filter((event) => event.eventType === "file_scanned").length,
        sensitiveFileCount: events.filter((event) => ["sensitive_file_detected", "file_upload_blocked", "file_upload_warned"].includes(event.eventType)).length,
        blockedCount: events.filter((event) => event.actionTaken === "blocked").length,
        warnedCount: events.filter((event) => event.actionTaken === "warned").length,
        piiAttemptCount: events.filter((event) => ["sensitive_prompt_detected", "prompt_blocked", "prompt_warned"].includes(event.eventType)).length,
        fileUploadAttemptCount: events.filter((event) => ["sensitive_file_detected", "file_upload_blocked", "file_upload_warned"].includes(event.eventType)).length
      },
      recentEvents: events.slice(0, 25)
    });
  } catch (error) {
    next(error);
  }
});

router.put("/:id/status", validateBody(z.object({ approvedStatus: z.enum(["approved", "restricted", "blocked", "unknown"]) })), async (req, res, next) => {
  try {
    const item = await prisma.genAIApplication.update({ where: { id: req.params.id }, data: { approvedStatus: req.body.approvedStatus } });
    await auditLog({ organizationId: req.user!.organizationId, actorUserId: req.user!.id, action: "genai_app.status_updated", entityType: "genai_application", entityId: item.id, details: { approvedStatus: item.approvedStatus } });
    res.json({ item });
  } catch (error) {
    next(error);
  }
});

export default router;
