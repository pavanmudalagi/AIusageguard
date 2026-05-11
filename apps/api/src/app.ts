import express from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env";
import { errorHandler, notFound } from "./middleware/errors";
import authRoutes from "./modules/auth/routes";
import orgRoutes from "./modules/tenants/routes";
import endpointRoutes from "./modules/endpoints/routes";
import eventRoutes from "./modules/events/routes";
import appRoutes from "./modules/genai-apps/routes";
import policyRoutes from "./modules/policies/routes";
import dashboardRoutes from "./modules/dashboards/routes";
import educationRoutes from "./modules/education/routes";
import auditRoutes from "./modules/audit/routes";
import browserPluginRoutes from "./modules/browser-plugin/routes";
import alertRoutes from "./modules/alerts/routes";
import templateRoutes from "./modules/templates/routes";
import settingsRoutes from "./modules/settings/routes";
import userRoutes from "./modules/users/routes";
import { openApiDocument } from "./openapi/openapi";
import { prisma } from "./config/prisma";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || isAllowedCorsOrigin(origin)) return callback(null, true);
      return callback(new Error("CORS origin not allowed"));
    },
    credentials: true
  }));
  app.use(express.json({ limit: "256kb" }));

  app.get("/health", (_req, res) => res.json({ ok: true, privacy: "metadata-only" }));
  app.get("/api/v1/health", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok", database: "connected", timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: "error", database: "disconnected", timestamp: new Date().toISOString() });
    }
  });
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.get("/api/openapi.json", (_req, res) => res.json(openApiDocument));

  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/orgs", orgRoutes);
  app.use("/api/v1/endpoints", endpointRoutes);
  app.use("/api/v1/events", eventRoutes);
  app.use("/api/v1/genai-apps", appRoutes);
  app.use("/api/v1/policies", policyRoutes);
  app.use("/api/v1/dashboard", dashboardRoutes);
  app.use("/api/v1/browser-plugin", browserPluginRoutes);
  app.use("/api/v1/education", educationRoutes);
  app.use("/api/v1/alerts", alertRoutes);
  app.use("/api/v1/templates", templateRoutes);
  app.use("/api/v1/settings", settingsRoutes);
  app.use("/api/v1/users", userRoutes);
  app.use("/api/v1/audit", auditRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

function isAllowedCorsOrigin(origin: string) {
  const allowed = env.CORS_ORIGIN.split(",").map((value) => value.trim()).filter(Boolean);
  if (allowed.includes(origin)) return true;
  if (allowed.includes("*")) return true;
  const extensionPatterns = env.CORS_EXTENSION_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean);
  return extensionPatterns.some((pattern) => {
    if (pattern.endsWith("://*")) return origin.startsWith(pattern.slice(0, -"*".length));
    return pattern === origin;
  });
}
