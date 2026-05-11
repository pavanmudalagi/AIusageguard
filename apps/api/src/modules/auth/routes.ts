import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errors";

const router = Router();
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

router.post("/login", validateBody(loginSchema), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { email: req.body.email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) {
      throw new ApiError(401, "Invalid email or password");
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const token = jwt.sign(
      { id: user.id, organizationId: user.organizationId, role: user.role, email: user.email },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"] }
    );
    res.json({ token, user: safeUser(user) });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, include: { organization: true } });
    res.json({ user: safeUser(user) });
  } catch (error) {
    next(error);
  }
});

function safeUser(user: { id: string; email: string; name: string; role: string; organizationId: string }) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, organizationId: user.organizationId };
}

export default router;
