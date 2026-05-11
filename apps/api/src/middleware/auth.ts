import type { RequestHandler } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { ApiError } from "./errors";

export interface AuthUser {
  id: string;
  organizationId: string;
  role: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      endpointAuthOrgId?: string;
    }
  }
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return next(new ApiError(401, "Missing bearer token"));

  try {
    req.user = jwt.verify(token, env.JWT_SECRET) as AuthUser;
    return next();
  } catch {
    return next(new ApiError(401, "Invalid bearer token"));
  }
};

export const requireEndpointToken: RequestHandler = async (req, _res, next) => {
  const token = req.header("x-enrollment-token") || req.header("x-api-key");
  const organizationId = req.body?.organizationId ?? req.header("x-organization-id");
  if (!token || !organizationId) return next(new ApiError(401, "Missing endpoint enrollment token"));

  const [org, enrollmentTokens] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId } }),
    prisma.enrollmentToken.findMany({
      where: {
        organizationId,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      select: { tokenHash: true },
      orderBy: { createdAt: "desc" },
      take: 25
    })
  ]);
  if (!org?.enrollmentTokenHash && enrollmentTokens.length === 0) return next(new ApiError(401, "Endpoint enrollment is not configured"));

  const orgTokenOk = org?.enrollmentTokenHash ? await bcrypt.compare(token, org.enrollmentTokenHash) : false;
  const enrollmentTokenOk = orgTokenOk ? true : (await Promise.all(enrollmentTokens.map((item) => bcrypt.compare(token, item.tokenHash)))).some(Boolean);
  const ok = orgTokenOk || enrollmentTokenOk;
  if (!ok) return next(new ApiError(401, "Invalid endpoint enrollment token"));
  req.endpointAuthOrgId = organizationId;
  return next();
};

export function orgWhereForUser(user: AuthUser) {
  if (user.role === "super_admin") return {};
  if (user.role === "msp_admin") {
    return { OR: [{ id: user.organizationId }, { parentOrgId: user.organizationId }] };
  }
  return { id: user.organizationId };
}

export function assertOrgAccess(user: AuthUser, organizationId: string): void {
  if (user.role === "super_admin") return;
  if (user.organizationId === organizationId) return;
  if (user.role === "msp_admin") return;
  throw new ApiError(403, "Organization access denied");
}
