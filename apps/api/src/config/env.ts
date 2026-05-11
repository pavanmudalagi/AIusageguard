import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(24),
  JWT_EXPIRES_IN: z.string().default("8h"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  CORS_EXTENSION_ORIGINS: z.string().default("chrome-extension://*,moz-extension://*,ms-browser-extension://*"),
  RAW_COLLECTION_ENABLED: z.coerce.boolean().default(false),
  DEFAULT_ENROLLMENT_TOKEN: z.string().min(12).default("demo-enrollment-token")
});

export const env = envSchema.parse(process.env);
