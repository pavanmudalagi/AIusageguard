import type { Rule } from "../types";

export const businessRules: Rule[] = [
  { id: "business_confidential", category: "business_sensitive", label: "Business Sensitive", riskLevel: "low", confidence: "medium", pattern: /\b(?:confidential|internal only|restricted|trade secret|contract value|customer list|roadmap|कंपनी गोपनीय|سرّي|機密|confidencial)\b/giu, placeholder: "[Business Sensitive]" }
];
