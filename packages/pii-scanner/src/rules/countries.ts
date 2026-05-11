import type { Rule } from "../types";
import { cnpj, cpf } from "./helpers";

export const countryRules: Rule[] = [
  { id: "in_aadhaar", country: "IN", category: "government_id", label: "Aadhaar", riskLevel: "high", confidence: "high", pattern: /\b\d{4}\s?\d{4}\s?\d{4}\b/gu, placeholder: "[Government ID]", context: ["aadhaar", "आधार", "uidai"] },
  { id: "in_pan", country: "IN", category: "tax_id", label: "PAN", riskLevel: "high", confidence: "high", pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/gu, placeholder: "[Tax ID]" },
  { id: "in_ifsc", country: "IN", category: "bank_account", label: "IFSC", riskLevel: "high", confidence: "high", pattern: /\b[A-Z]{4}0[A-Z0-9]{6}\b/gu, placeholder: "[Bank Code]" },
  { id: "us_ssn", country: "US", category: "government_id", label: "SSN", riskLevel: "high", confidence: "high", pattern: /\b\d{3}-\d{2}-\d{4}\b/gu, placeholder: "[Government ID]", context: ["ssn", "social security", "taxpayer"] },
  { id: "us_ein", country: "US", category: "tax_id", label: "EIN", riskLevel: "high", confidence: "medium", pattern: /\b\d{2}-\d{7}\b/gu, placeholder: "[Tax ID]", context: ["ein", "employer identification"] },
  { id: "uk_nin", country: "GB", category: "government_id", label: "National Insurance Number", riskLevel: "high", confidence: "high", pattern: /\b(?!BG|GB|KN|NK|NT|TN|ZZ)[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/giu, placeholder: "[Government ID]" },
  { id: "uk_postcode", country: "GB", category: "postal_address", label: "UK Postcode", riskLevel: "medium", confidence: "medium", pattern: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/giu, placeholder: "[Postal Code]", context: ["postcode", "postal", "address"] },
  { id: "ca_sin", country: "CA", category: "government_id", label: "SIN", riskLevel: "high", confidence: "medium", pattern: /\b\d{3}[- ]?\d{3}[- ]?\d{3}\b/gu, placeholder: "[Government ID]", context: ["sin", "social insurance"] },
  { id: "ca_postal", country: "CA", category: "postal_address", label: "Canadian Postal Code", riskLevel: "medium", confidence: "medium", pattern: /\b[A-Z]\d[A-Z][ -]?\d[A-Z]\d\b/giu, placeholder: "[Postal Code]", context: ["postal", "address"] },
  { id: "au_tfn", country: "AU", category: "tax_id", label: "Tax File Number", riskLevel: "high", confidence: "medium", pattern: /\b\d{3}\s?\d{3}\s?\d{3}\b/gu, placeholder: "[Tax ID]", context: ["tfn", "tax file"] },
  { id: "au_abn", country: "AU", category: "tax_id", label: "ABN", riskLevel: "high", confidence: "medium", pattern: /\b\d{2}\s?\d{3}\s?\d{3}\s?\d{3}\b/gu, placeholder: "[Tax ID]", context: ["abn", "australian business"] },
  { id: "it_cf", country: "IT", category: "tax_id", label: "Codice Fiscale", riskLevel: "high", confidence: "high", pattern: /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/giu, placeholder: "[Tax ID]" },
  { id: "br_cpf", country: "BR", category: "tax_id", label: "CPF", riskLevel: "high", confidence: "high", pattern: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/gu, placeholder: "[Tax ID]", validator: (value) => cpf(value) },
  { id: "br_cnpj", country: "BR", category: "tax_id", label: "CNPJ", riskLevel: "high", confidence: "high", pattern: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/gu, placeholder: "[Tax ID]", validator: (value) => cnpj(value) },
  { id: "mx_curp", country: "MX", category: "government_id", label: "CURP", riskLevel: "high", confidence: "high", pattern: /\b[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/giu, placeholder: "[Government ID]" },
  { id: "mx_rfc", country: "MX", category: "tax_id", label: "RFC", riskLevel: "high", confidence: "medium", pattern: /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/giu, placeholder: "[Tax ID]", context: ["rfc"] },
  { id: "sg_nric", country: "SG", category: "government_id", label: "NRIC/FIN", riskLevel: "high", confidence: "high", pattern: /\b[STFGM]\d{7}[A-Z]\b/giu, placeholder: "[Government ID]" },
  { id: "jp_my_number", country: "JP", category: "government_id", label: "My Number", riskLevel: "high", confidence: "medium", pattern: /\b\d{12}\b/gu, placeholder: "[Government ID]", context: ["my number", "マイナンバー", "個人番号"] },
  { id: "ae_emirates_id", country: "AE", category: "government_id", label: "Emirates ID", riskLevel: "high", confidence: "high", pattern: /\b784-\d{4}-\d{7}-\d\b/gu, placeholder: "[Government ID]" },
  { id: "za_id", country: "ZA", category: "government_id", label: "South African ID", riskLevel: "high", confidence: "medium", pattern: /\b\d{6}[0-9]{7}\b/gu, placeholder: "[Government ID]", context: ["south african id", "identity number"] },
  { id: "es_dni_nie", country: "ES", category: "government_id", label: "DNI/NIE", riskLevel: "high", confidence: "medium", pattern: /\b(?:\d{8}[A-Z]|[XYZ]\d{7}[A-Z])\b/giu, placeholder: "[Government ID]", context: ["dni", "nie"] },
  { id: "nl_bsn", country: "NL", category: "government_id", label: "BSN", riskLevel: "high", confidence: "medium", pattern: /\b\d{8,9}\b/gu, placeholder: "[Government ID]", context: ["bsn", "burgerservicenummer"] },
  { id: "fr_insee", country: "FR", category: "government_id", label: "INSEE", riskLevel: "high", confidence: "medium", pattern: /\b[12]\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{3}\s?\d{3}\s?\d{2}\b/gu, placeholder: "[Government ID]", context: ["insee", "sécurité sociale"] },
  { id: "de_steuer", country: "DE", category: "tax_id", label: "Steuer-ID", riskLevel: "high", confidence: "medium", pattern: /\b\d{11}\b/gu, placeholder: "[Tax ID]", context: ["steuer", "tax id", "identifikationsnummer"] }
];
