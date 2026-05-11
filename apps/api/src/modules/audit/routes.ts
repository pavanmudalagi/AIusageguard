import { Router } from "express";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (_req, res, next) => {
  try {
    res.json({ items: await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }) });
  } catch (error) {
    next(error);
  }
});

export default router;
