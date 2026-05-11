import { eventIngestSchema, findForbiddenTelemetryFields } from "@ai-usage-guard/shared";
import { ForbiddenRawContentError, MetadataTooLargeError } from "./errors";
import type { BrowserEventPayload } from "./types";

export function validateSafeEvent(payload: BrowserEventPayload): BrowserEventPayload {
  if (findForbiddenTelemetryFields(payload).length > 0) {
    throw new ForbiddenRawContentError();
  }

  const metadataBytes = new TextEncoder().encode(JSON.stringify(payload.metadata ?? {})).length;
  if (metadataBytes > 16_384) {
    throw new MetadataTooLargeError();
  }

  return eventIngestSchema.parse(payload);
}

export function safeWarn(logger: Pick<Console, "warn"> | undefined, error: unknown): void {
  if (error instanceof ForbiddenRawContentError) {
    logger?.warn("Event rejected because it contained forbidden raw content fields.");
  }
}
