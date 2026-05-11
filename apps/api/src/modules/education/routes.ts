import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";

const router = Router();
router.use(requireAuth);

router.get("/recommendations", async (_req, res, next) => {
  try {
    await refreshRecommendations();
    const items = await prisma.educationRecommendation.findMany({ orderBy: { riskyEventCount: "desc" }, take: 100 });
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.post("/recommendations/:id/assign", async (req, res, next) => {
  try {
    res.json({ item: await prisma.educationRecommendation.update({ where: { id: req.params.id }, data: { status: "assigned", assignedAt: new Date() } }) });
  } catch (error) {
    next(error);
  }
});

router.post("/recommendations/:id/acknowledge", async (req, res, next) => {
  try {
    res.json({ item: await prisma.educationRecommendation.update({ where: { id: req.params.id }, data: { status: "acknowledged", acknowledgedAt: new Date() } }) });
  } catch (error) {
    next(error);
  }
});

router.post("/generate-draft", validateBody(z.object({ categories: z.array(z.string()).default([]), audience: z.string().default("employees") })), (req, res) => {
  const categories = req.body.categories.length ? req.body.categories.join(", ") : "email addresses and customer identifiers";
  res.json({
    title: "How to Use Generative AI Safely Without Sharing Sensitive Data",
    body: `Your recent AI usage triggered warnings for sensitive data categories such as ${categories}. This guide explains how to use AI safely by replacing real data with placeholders.\n\nExamples:\n- Use [Customer Name] instead of real names.\n- Use [Email Address] instead of actual emails.\n- Use [Account ID] instead of real account numbers.\n- Never paste passwords, API keys, tokens, or private keys.\n\nBefore using an AI tool, confirm the app is approved, remove sensitive values, and follow the active policy shown by AI Usage Guard.`
  });
});

async function refreshRecommendations() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const events = await prisma.usageEvent.findMany({
    where: { createdAt: { gte: since }, riskLevel: { in: ["medium", "high", "critical"] } },
    include: { endpointUser: true }
  });
  const groups = new Map<string, { organizationId: string; endpointId?: string; categories: Set<string>; count: number }>();
  for (const event of events) {
    const user = event.endpointUser?.userIdentifierHash;
    if (!user) continue;
    const group = groups.get(user) ?? { organizationId: event.organizationId, endpointId: event.endpointId, categories: new Set<string>(), count: 0 };
    event.detectedCategories.forEach((category) => group.categories.add(category));
    group.count += 1;
    groups.set(user, group);
  }
  for (const [userIdentifierHash, group] of groups) {
    if (group.count < 3) continue;
    const existing = await prisma.educationRecommendation.findFirst({ where: { organizationId: group.organizationId, userIdentifierHash, status: { in: ["recommended", "assigned"] } } });
    if (!existing) {
      await prisma.educationRecommendation.create({
        data: {
          organizationId: group.organizationId,
          userIdentifierHash,
          endpointId: group.endpointId,
          categories: [...group.categories],
          riskyEventCount: group.count,
          recommendedTopic: "Safe GenAI usage with sensitive data placeholders"
        }
      });
    }
  }
}

export default router;
