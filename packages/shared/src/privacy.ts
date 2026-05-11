import { forbiddenTelemetryFieldNames } from "./constants";

const forbidden = new Set<string>(forbiddenTelemetryFieldNames.map((name) => name.toLowerCase()));

export function findForbiddenTelemetryFields(value: unknown, path = "$"): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenTelemetryFields(item, `${path}[${index}]`));
  }

  const findings: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbidden.has(key.toLowerCase())) {
      findings.push(`${path}.${key}`);
    }
    findings.push(...findForbiddenTelemetryFields(child, `${path}.${key}`));
  }
  return findings;
}

export function assertNoForbiddenTelemetryFields(value: unknown): void {
  const findings = findForbiddenTelemetryFields(value);
  if (findings.length > 0) {
    throw new Error(`Telemetry contains disallowed raw or secret fields: ${findings.join(", ")}`);
  }
}
