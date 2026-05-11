import type { z } from "zod";
import type { eventIngestSchema } from "./event-schema";
import type { aiUsageGuardPolicySchema } from "./policy-schema";

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ActionTaken = "allowed" | "warned" | "blocked" | "redacted" | "user_override";
export type InputType = "prompt" | "file_upload" | "desktop_app" | "browser";
export type PolicyJson = z.infer<typeof aiUsageGuardPolicySchema>;
export type EventIngest = z.infer<typeof eventIngestSchema>;

export interface ApiPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
