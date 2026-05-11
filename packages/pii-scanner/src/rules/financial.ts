import type { Rule } from "../types";
import { luhn } from "./helpers";

export const financialRules: Rule[] = [
  { id: "payment_card", category: "payment_card", label: "Payment Card", riskLevel: "critical", confidence: "high", pattern: /\b(?:\d[ -]*?){13,19}\b/gu, placeholder: "[Payment Card]", validator: (value) => luhn(value) },
  { id: "iban", category: "iban", label: "IBAN", riskLevel: "high", confidence: "high", pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gu, placeholder: "[IBAN]" },
  { id: "swift", category: "swift_bic", label: "SWIFT/BIC", riskLevel: "high", confidence: "high", pattern: /\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/gu, placeholder: "[SWIFT/BIC]", context: ["swift", "bic", "bank code"] },
  { id: "bank_account_context", category: "bank_account", label: "Bank Account Number", riskLevel: "high", confidence: "medium", pattern: /\b\d{8,18}\b/gu, placeholder: "[Bank Account]", context: ["bank account", "account number", "acct", "iban", "routing", "sort code", "ifsc", "account no"] },
  { id: "routing_context", category: "routing_number", label: "Routing Number", riskLevel: "high", confidence: "medium", pattern: /\b\d{9}\b/gu, placeholder: "[Routing Number]", context: ["routing", "aba"] },
  { id: "sort_code", category: "sort_code", label: "Sort Code", riskLevel: "high", confidence: "high", pattern: /\b\d{2}-\d{2}-\d{2}\b/gu, placeholder: "[Sort Code]", context: ["sort code", "bank"] },
  { id: "upi", category: "upi_id", label: "UPI ID", riskLevel: "high", confidence: "high", pattern: /\b[\w.-]{2,64}@[a-zA-Z]{2,32}\b/gu, placeholder: "[UPI ID]", context: ["upi", "vpa", "pay"] },
  { id: "crypto_btc", category: "crypto_wallet", label: "Crypto Wallet", riskLevel: "high", confidence: "medium", pattern: /\b(?:bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}\b/gu, placeholder: "[Crypto Wallet]", context: ["wallet", "bitcoin", "btc", "crypto"] },
  { id: "crypto_eth", category: "crypto_wallet", label: "Ethereum Wallet", riskLevel: "high", confidence: "medium", pattern: /\b0x[a-fA-F0-9]{40}\b/gu, placeholder: "[Crypto Wallet]", context: ["wallet", "ethereum", "eth", "crypto"] }
];
