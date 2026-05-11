const assert = require("node:assert/strict");

const SAFE_PLACEHOLDERS = [
  "[Email Address]",
  "[Phone Number]",
  "[Customer Name]",
  "[Employee Name]",
  "[Government ID]",
  "[Tax ID]",
  "[Passport Number]",
  "[Bank Account Number]",
  "[Payment Card Number]",
  "[IBAN]",
  "[SWIFT/BIC]",
  "[API Key]",
  "[Password]",
  "[Token]",
  "[Private Key]",
  "[Address]",
  "[Internal System]",
  "[Medical Record]",
  "[Sensitive Term]"
];
const placeholderSet = new Set(SAFE_PLACEHOLDERS.map((value) => value.toLowerCase()));
const contextOnlyLabels = new Set(["aadhaar", "aadhar", "social security", "government id", "bank account", "account number", "email address", "phone number", "verification", "identity verification", "kyc", "customer", "account closure", "account closer", "bank account number"]);
const placeholders = {
  email: "[Email Address]",
  phone: "[Phone Number]",
  government_id: "[Government ID]",
  bank_account: "[Bank Account Number]",
  payment_card: "[Payment Card Number]",
  api_key: "[API Key]",
  access_token: "[Token]",
  secret_key: "[API Key]",
  private_key: "[Private Key]"
};
const priority = { api_key: 95, payment_card: 90, government_id: 80, bank_account: 75, email: 60, phone: 40 };

function findSafePlaceholderRanges(text) {
  const ranges = [];
  for (const placeholder of SAFE_PLACEHOLDERS) {
    let index = text.indexOf(placeholder);
    while (index !== -1) {
      ranges.push({ start: index, end: index + placeholder.length });
      index = text.indexOf(placeholder, index + placeholder.length);
    }
  }
  return ranges;
}

function isInsideSafePlaceholder(text, start, end) {
  return findSafePlaceholderRanges(text).some((range) => start >= range.start && end <= range.end);
}

function isSafePlaceholderValue(value) {
  return placeholderSet.has(String(value || "").trim().toLowerCase());
}

function isContextOnlyValue(value) {
  return contextOnlyLabels.has(String(value || "").trim().replace(/[\s:.,#-]+$/g, "").toLowerCase());
}

function hasActualSensitiveValue(category, value) {
  const normalized = String(value || "").trim();
  if (!normalized || isSafePlaceholderValue(normalized) || isContextOnlyValue(normalized)) return false;
  if (["email", "api_key", "access_token", "secret_key", "private_key", "payment_card"].includes(category)) return true;
  if (["phone", "government_id", "bank_account"].includes(category)) return /\d/.test(normalized);
  return true;
}

function luhn(value) {
  const digits = value.replace(/\D/g, "");
  let sum = 0;
  let doubleDigit = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return digits.length >= 13 && digits.length <= 19 && sum % 10 === 0;
}

function addFinding(findings, category, value, start, end) {
  if (!hasActualSensitiveValue(category, value)) return;
  if (isInsideSafePlaceholder(findings.sourceText || "", start, end)) return;
  findings.push({ category, value, start, end, placeholder: placeholders[category] || "[Sensitive Value]" });
}

function addRegex(findings, text, category, regex, validator) {
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const value = match[0];
    if (!isInsideSafePlaceholder(text, match.index, match.index + value.length) && (!validator || validator(value))) addFinding(findings, category, value, match.index, match.index + value.length);
    if (match.index === regex.lastIndex) regex.lastIndex += 1;
  }
}

function addContext(findings, text, category, regex, validator) {
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const prefix = match[1] || "";
    const value = match[2] || "";
    const start = match.index + prefix.length;
    if (!isInsideSafePlaceholder(text, start, start + value.length) && (!validator || validator(value, prefix))) addFinding(findings, category, value, start, start + value.length);
    if (match.index === regex.lastIndex) regex.lastIndex += 1;
  }
}

function scan(text) {
  const findings = [];
  findings.sourceText = text;
  addRegex(findings, text, "email", /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  addRegex(findings, text, "phone", /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?){2,4}\d{3,4}\b/g);
  addRegex(findings, text, "government_id", /\b\d{3}-\d{2}-\d{4}\b/g);
  addContext(findings, text, "government_id", /(\b(?:social\s+security|ssn|government\s+id|national\s+id|tax\s+id)\b[\s\S]{0,80}?[:#]?\s*)([A-Z0-9][A-Z0-9-]{4,30}\b)/gi, (value) => /\d/.test(value));
  addContext(findings, text, "bank_account", /(\b(?:bank\s+account|account\s+(?:id|number|no)|acct)\b(?:\s+(?:id|number|no|is)){0,2}[\s:=-]*)([A-Z0-9][A-Z0-9 -]{5,30}\b)/gi, (value) => /\d/.test(value));
  addRegex(findings, text, "payment_card", /\b(?:\d[ -]*?){13,19}\b/g, luhn);
  addRegex(findings, text, "api_key", /\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{20,})\b/g);
  return removeOverlaps(findings);
}

function generateBusinessSafePrompt(text) {
  const normalized = text.toLowerCase();
  if (/account\s+(closure|closer|closed|blocked|status|verification)|bank\s+account/.test(normalized)) return "Write a professional email to [Customer Name] explaining that there is an issue with their account status and asking them to contact support or use the approved secure channel for next steps.";
  if (/identity\s+verification|aadhaar|aadhar|ssn|social\s+security|kyc/.test(normalized)) return "Write a professional email to [Customer Name] explaining that their identity verification failed and asking them to re-submit the required details through the approved secure channel.";
  return "";
}

function generateSafePrompt(originalPrompt, findings, options = {}) {
  if ((options.mode || "business_safe") === "business_safe") {
    const safe = generateBusinessSafePrompt(originalPrompt);
    if (safe) return safe;
  }
  const sorted = [...findings]
    .filter((finding) => Number.isFinite(finding.start) && Number.isFinite(finding.end) && finding.end > finding.start)
    .filter((finding) => !isInsideSafePlaceholder(originalPrompt, finding.start, finding.end))
    .filter((finding) => !isSafePlaceholderValue(finding.value) && !isContextOnlyValue(finding.value))
    .sort((a, b) => b.start - a.start || (priority[b.category] || 0) - (priority[a.category] || 0) || b.end - a.end);
  let safePrompt = originalPrompt;
  let lastStart = safePrompt.length + 1;
  for (const finding of sorted) {
    if (finding.end > lastStart) continue;
    safePrompt = safePrompt.slice(0, finding.start) + finding.placeholder + safePrompt.slice(finding.end);
    lastStart = finding.start;
  }
  return safePrompt;
}

function removeOverlaps(findings) {
  const accepted = [];
  for (const finding of [...findings].sort((a, b) => (priority[b.category] || 0) - (priority[a.category] || 0) || a.start - b.start)) {
    if (!accepted.some((candidate) => finding.start < candidate.end && finding.end > candidate.start)) accepted.push(finding);
  }
  return accepted.sort((a, b) => a.start - b.start);
}

function reportingSafe(findings) {
  const detectedCategoryCounts = {};
  for (const finding of findings) detectedCategoryCounts[finding.category] = (detectedCategoryCounts[finding.category] || 0) + 1;
  return {
    detectedCategories: Object.keys(detectedCategoryCounts),
    detectedCategoryCounts,
    riskLevel: Object.keys(detectedCategoryCounts).some((category) => ["government_id", "bank_account", "payment_card", "api_key"].includes(category)) ? "high" : "medium"
  };
}

function evaluatePromptForModal(text, policy = { promptScanning: { enabled: true }, piiDetection: { enabled: true }, onPiiDetected: { promptAction: "block" } }) {
  const findings = policy.promptScanning.enabled && policy.piiDetection.enabled ? scan(text) : [];
  if (!findings.length) return { action: "ALLOW", shouldShowPopup: false, detectedCategories: [] };
  return { action: policy.onPiiDetected.promptAction.toUpperCase(), shouldShowPopup: policy.onPiiDetected.promptAction !== "allow", detectedCategories: findings.map((finding) => finding.category) };
}

assert.equal(scan("[Email Address]").length, 0);
assert.equal(scan("[Bank Account Number]").length, 0);
assert.equal(scan("[Government ID]").length, 0);
assert.equal(scan("social security [Government ID]").length, 0);
assert.equal(scan("bank account id: [Bank Account Number]").length, 0);
assert.equal(scan("Government ID").length, 0);
assert.equal(scan("Bank Account Number").length, 0);
assert.deepEqual(evaluatePromptForModal("write a normal product update email"), { action: "ALLOW", shouldShowPopup: false, detectedCategories: [] });
assert.equal(evaluatePromptForModal("write to pavan@gmail.com").shouldShowPopup, true);
assert.deepEqual(scan("social security aazz123456").map((finding) => finding.category), ["government_id"]);
assert.deepEqual(scan("bank account id: 12345678").map((finding) => finding.category), ["bank_account"]);

const cases = [
  ["email", "Email me at pavan@gmail.com", "Email me at [Email Address]"],
  ["phone", "Call +1 415 555 0199 today", "Call [Phone Number] today"],
  ["government ID", "SSN is 123-45-6789", "SSN is [Government ID]"],
  ["bank account", "bank account id: 12345678", "bank account id: [Bank Account Number]"],
  ["multiple values", "Write to john@example.com about SSN 123-45-6789 and bank account number is 123132810938.", "Write to [Email Address] about SSN [Government ID] and bank account number is [Bank Account Number]."],
  ["preserves wording", "please draft in Kannada for ಅಜಯ at ajay@example.com", "please draft in Kannada for ಅಜಯ at [Email Address]"],
  ["repeated values", "Email a@b.com and cc a@b.com", "Email [Email Address] and cc [Email Address]"],
  ["unicode", "メールを pavan@gmail.com に送ってください", "メールを [Email Address] に送ってください"]
];

for (const [name, input, expected] of cases) {
  assert.equal(generateSafePrompt(input, scan(input), { mode: "placeholder_redaction" }), expected, name);
}

const sample = "write an email to pavan@gmail.com about this account closer with a bank account id: 12345678, social security aazz123456";
const businessSafeSample = generateSafePrompt(sample, scan(sample));
assert.equal(businessSafeSample, "Write a professional email to [Customer Name] explaining that there is an issue with their account status and asking them to contact support or use the approved secure channel for next steps.");
const directSafeSample = generateSafePrompt(sample, scan(sample), { mode: "placeholder_redaction" });
assert.equal(directSafeSample, "write an email to [Email Address] about this account closer with a bank account id: [Bank Account Number], social security [Government ID]");
assert.equal(generateSafePrompt(directSafeSample, scan(directSafeSample), { mode: "placeholder_redaction" }), directSafeSample);
assert.equal(directSafeSample.includes("[[[["), false);

const telemetry = reportingSafe(scan(sample));
assert.deepEqual(telemetry.detectedCategoryCounts, { email: 1, bank_account: 1, government_id: 1 });
assert.equal(JSON.stringify(telemetry).includes("pavan@gmail.com"), false);
assert.equal(JSON.stringify(telemetry).includes("12345678"), false);
assert.equal(JSON.stringify(telemetry).includes("aazz123456"), false);
assert.equal(JSON.stringify(telemetry).includes(directSafeSample), false);

function setPromptInputValue(el, value) {
  if ("value" in el) {
    el.value = value;
    el.inputDispatched = true;
    el.changeDispatched = true;
    return;
  }
  if (el.isContentEditable) {
    el.textContent = value;
    el.inputDispatched = true;
  }
}

function evaluateAfterReplacement(el, value) {
  setPromptInputValue(el, value);
  const findings = scan(el.value || el.textContent || "");
  return { decision: findings.length ? "BLOCK" : "ALLOW", detectedCategories: findings.map((finding) => finding.category), reason: findings.length ? "Sensitive data detected." : "No sensitive data detected." };
}

const textarea = { value: "" };
const afterReplace = evaluateAfterReplacement(textarea, directSafeSample);
assert.equal(textarea.value, directSafeSample);
assert.equal(afterReplace.decision, "ALLOW");
assert.deepEqual(afterReplace.detectedCategories, []);
assert.equal(afterReplace.reason, "No sensitive data detected.");
assert.equal(scan(textarea.value).length, 0);

const contenteditable = { isContentEditable: true, textContent: "" };
setPromptInputValue(contenteditable, "safe");
assert.equal(contenteditable.textContent, "safe");
assert.equal(contenteditable.inputDispatched, true);

const policyDrawerStyle = "position:fixed;right:0;top:0;bottom:0;z-index:2147483647;width:360px;height:100vh;overflow:auto;";
assert.equal(policyDrawerStyle.includes("right:0"), true);
assert.equal(policyDrawerStyle.includes("width:360px"), true);

console.log("Extension redaction tests passed");
