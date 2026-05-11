import type { Rule } from "../types";

export const healthcareRules: Rule[] = [
  { id: "medical_record", category: "medical_record", label: "Medical Record Number", riskLevel: "high", confidence: "high", pattern: /\b(?:medical record|mrn|health record|patient record)\s*[:#-]?\s*[A-Z0-9-]{5,24}\b/giu, placeholder: "[Medical Record]" }
];
