import type { Rule } from "../types";

export const secretRules: Rule[] = [
  { id: "password_assignment", category: "password", label: "Password", riskLevel: "critical", confidence: "high", pattern: /\b(?:password|passwd|pwd)\s*[:=]\s*["']?[^"'\s]{6,}/giu, placeholder: "[Password]" },
  { id: "jwt", category: "token", label: "JWT", riskLevel: "critical", confidence: "high", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/gu, placeholder: "[Token]" },
  { id: "private_key", category: "private_key", label: "Private Key", riskLevel: "critical", confidence: "high", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/gu, placeholder: "[Private Key]" },
  { id: "aws_access_key", category: "api_key", label: "AWS Access Key", riskLevel: "critical", confidence: "high", pattern: /\bAKIA[0-9A-Z]{16}\b/gu, placeholder: "[API Key]" },
  { id: "github_token", category: "api_key", label: "GitHub Token", riskLevel: "critical", confidence: "high", pattern: /\b(?:ghp|github_pat|gho|ghu|ghs)_[A-Za-z0-9_]{20,}\b/gu, placeholder: "[API Key]" },
  { id: "slack_token", category: "token", label: "Slack Token", riskLevel: "critical", confidence: "high", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/gu, placeholder: "[Token]" },
  { id: "google_api_key", category: "api_key", label: "Google API Key", riskLevel: "critical", confidence: "high", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/gu, placeholder: "[API Key]" },
  { id: "bearer_token", category: "token", label: "Bearer Token", riskLevel: "critical", confidence: "high", pattern: /\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/gu, placeholder: "[Token]" },
  { id: "oauth_secret", category: "api_key", label: "OAuth Client Secret", riskLevel: "critical", confidence: "high", pattern: /\b(?:client_secret|oauth_secret)\s*[:=]\s*["']?[A-Za-z0-9._~+/-]{16,}/giu, placeholder: "[API Key]" },
  { id: "db_connection", category: "database_connection", label: "Database Connection String", riskLevel: "critical", confidence: "high", pattern: /\b(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^@\s]+:[^@\s]+@[^/\s]+/giu, placeholder: "[Database Connection]" },
  { id: "gcp_service_account", category: "private_key", label: "GCP Service Account Key", riskLevel: "critical", confidence: "high", pattern: /"type"\s*:\s*"service_account"[\s\S]{0,2000}"private_key"\s*:/gu, placeholder: "[Private Key]" }
];
