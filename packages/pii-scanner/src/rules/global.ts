import type { Rule } from "../types";

const idContext = ["id", "identifier", "account", "customer", "employee", "patient", "member", "client", "رقم", "識別", "identificación", "identifiant"];

export const globalRules: Rule[] = [
  { id: "email", category: "email", label: "Email Address", riskLevel: "medium", confidence: "high", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, placeholder: "[Email Address]" },
  { id: "intl_phone", category: "phone", label: "Phone Number", riskLevel: "medium", confidence: "medium", pattern: /(?:\+\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?){2,4}\d{3,4}/gu, placeholder: "[Phone Number]", context: ["phone", "mobile", "tel", "contact", "call", "whatsapp", "फोन", "電話", "teléfono"] },
  { id: "address_context", category: "postal_address", label: "Postal Address", riskLevel: "medium", confidence: "medium", pattern: /\b\d{1,6}\s+[\p{L}\d.'-]+(?:\s+[\p{L}\d.'-]+){0,6}\s+(?:street|st|road|rd|avenue|ave|lane|ln|boulevard|blvd|drive|dr|straße|strasse|rue|calle|road|मार्ग|道)\b/giu, placeholder: "[Postal Address]" },
  { id: "dob_context", category: "date_of_birth", label: "Date of Birth", riskLevel: "medium", confidence: "high", pattern: /\b(?:date of birth|dob|birth date|born|fecha de nacimiento|जन्म|生年月日)\s*[:#-]?\s*\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4}\b/giu, placeholder: "[Date of Birth]" },
  { id: "passport_context", category: "passport", label: "Passport Number", riskLevel: "high", confidence: "high", pattern: /\b(?:passport|pasaporte|passeport|reisepass|पासपोर्ट)\s*(?:number|no|#|:)?\s*[A-Z0-9]{6,12}\b/giu, placeholder: "[Passport Number]" },
  { id: "gov_id_context", category: "government_id", label: "Government ID", riskLevel: "high", confidence: "medium", pattern: /\b(?:government id|national id|govt id|identity number|documento nacional|رقم الهوية|マイナンバー)\s*(?:number|no|#|:)?\s*[A-Z0-9-]{5,24}\b/giu, placeholder: "[Government ID]" },
  { id: "customer_id_context", category: "customer_name", label: "Person Name", riskLevel: "medium", confidence: "low", pattern: /\b(?:customer|patient|employee|client|name|नाम|nombre|氏名)\s*[:#-]\s*[\p{Lu}][\p{L}'-]+(?:\s+[\p{Lu}][\p{L}'-]+){1,3}\b/gu, placeholder: "[Person Name]" },
  { id: "generic_account_id", category: "account_id", label: "Account or Customer ID", riskLevel: "medium", confidence: "medium", pattern: /\b[A-Z]{0,4}\d{6,12}\b/gu, placeholder: "[Account ID]", context: idContext },
  { id: "patient_id", category: "patient_id", label: "Patient ID", riskLevel: "high", confidence: "high", pattern: /\b(?:patient id|medical record|mrn|health record|patient number)\s*[:#-]?\s*[A-Z0-9-]{5,20}\b/giu, placeholder: "[Patient ID]" },
  { id: "insurance_id", category: "insurance_id", label: "Insurance Policy Number", riskLevel: "high", confidence: "medium", pattern: /\b(?:insurance|policy number|member id)\s*[:#-]?\s*[A-Z0-9-]{6,24}\b/giu, placeholder: "[Insurance ID]" }
];
