const supportedGenAIHosts = [
  "https://chatgpt.com/*",
  "https://chat.openai.com/*",
  "https://claude.ai/*",
  "https://gemini.google.com/*",
  "https://copilot.microsoft.com/*",
  "https://www.perplexity.ai/*",
  "https://poe.com/*",
  "https://grok.com/*",
  "https://notebooklm.google.com/*"
];

const transparentPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");

export function pluginFiles(enrollment: Record<string, unknown>, targetBrowser: "chrome" | "edge", pluginVersion = "0.7.1") {
  const extensionName = targetBrowser === "edge" ? "AI Usage Guard Browser Shield for Edge" : "AI Usage Guard Browser Shield";
  const hostPermissions = [...supportedGenAIHosts, serverHostPermission(String(enrollment.serverUrl ?? ""))].filter(Boolean);
  return {
    "browser-shield-plugin/manifest.json": JSON.stringify({
      manifest_version: 3,
      name: extensionName,
      version: pluginVersion,
      description: "Metadata-only GenAI policy enforcement shield.",
      permissions: ["storage", "alarms"],
      host_permissions: hostPermissions,
      background: { service_worker: "background/service-worker.js", type: "module" },
      content_scripts: [{ matches: supportedGenAIHosts, js: ["content/content-script.js"], run_at: "document_idle" }],
      action: { default_popup: "popup/index.html" },
      options_page: "options/index.html",
      icons: {
        "16": "assets/icon16.png",
        "48": "assets/icon48.png",
        "128": "assets/icon128.png"
      }
    }, null, 2),
    "browser-shield-plugin/config/enrollment.json": JSON.stringify(enrollment, null, 2),
    "browser-shield-plugin/background/service-worker.js": serviceWorkerJs(pluginVersion),
    "browser-shield-plugin/content/content-script.js": contentScriptJs(pluginVersion),
    "browser-shield-plugin/popup/index.html": popupHtml(),
    "browser-shield-plugin/popup/popup.js": popupJs(),
    "browser-shield-plugin/options/index.html": optionsHtml(),
    "browser-shield-plugin/options/options.js": optionsJs(),
    "browser-shield-plugin/assets/icon16.png": transparentPng,
    "browser-shield-plugin/assets/icon48.png": transparentPng,
    "browser-shield-plugin/assets/icon128.png": transparentPng,
    "browser-shield-plugin/README.md": `# AI Usage Guard Browser Shield\n\nVersion ${pluginVersion}.\n\nThis POC extension checks in, pulls policy, detects supported GenAI sites, performs local metadata-only prompt checks, and reports telemetry without raw prompts, raw files, extracted text, OCR text, screenshots, PII values, passwords, API keys, tokens, or private keys.\n`
  };
}

function serverHostPermission(serverUrl: string) {
  try {
    const url = new URL(serverUrl);
    return `${url.protocol}//${url.host}/*`;
  } catch {
    return "";
  }
}

function serviceWorkerJs(pluginVersion = "0.7.1") {
  return `
const PLUGIN_VERSION = "${pluginVersion}";
const CHECKIN_ALARM = "aiug-checkin";
const QUEUE_ALARM = "aiug-flush-queue";
const FORBIDDEN_FIELDS = ["rawPrompt", "promptText", "prompt", "fileContent", "fileText", "documentText", "extractedText", "ocrText", "screenshot", "password", "passwordValue", "token", "tokenValue", "apiKey", "apiKeyValue", "secret", "secretValue", "privateKey", "piiValue", "detectedValue", "rawValue"];

let cachedEnrollment = null;

async function loadEnrollment() {
  if (cachedEnrollment) return cachedEnrollment;
  const response = await fetch(chrome.runtime.getURL("config/enrollment.json"));
  cachedEnrollment = await response.json();
  await chrome.storage.local.set({ aiUsageGuardEnrollment: cachedEnrollment });
  return cachedEnrollment;
}

async function checkIn() {
  const enrollment = await loadEnrollment();
  const stored = await chrome.storage.local.get(["aiUsageGuardPolicy", "aiUsageGuardDeviceId"]);
  const deviceId = stored.aiUsageGuardDeviceId || crypto.randomUUID();
  await chrome.storage.local.set({ aiUsageGuardDeviceId: deviceId });

  try {
    const response = await fetch(enrollment.serverUrl + "/api/v1/endpoints/check-in", {
      method: "POST",
      headers: { "content-type": "application/json", "x-enrollment-token": enrollment.enrollmentToken, "x-organization-id": enrollment.organizationId },
      body: JSON.stringify({
        organizationId: enrollment.organizationId,
        deviceId,
        hostname: "browser-extension-host",
        machineName: "browser-extension-host",
        os: "browser",
        osVersion: "chrome",
        browser: "chrome",
        browserVersion: navigator.userAgentData?.brands?.map((brand) => brand.brand + " " + brand.version).join(", ") || navigator.userAgent,
        browserExtensionVersion: PLUGIN_VERSION,
        pluginVersion: PLUGIN_VERSION,
        currentPolicyId: stored.aiUsageGuardPolicy?.policyId || enrollment.defaultPolicyId,
        currentPolicyVersion: stored.aiUsageGuardPolicy?.policyVersion,
        lastPolicyAppliedAt: stored.aiUsageGuardPolicyAppliedAt
      })
    });
    const data = await response.json();
    const nextCheckInSeconds = Number(data.nextCheckInSeconds || 300);
    chrome.alarms.create(CHECKIN_ALARM, { periodInMinutes: Math.max(1, nextCheckInSeconds / 60) });
    await chrome.storage.local.set({ aiUsageGuardEnrollment: enrollment, aiUsageGuardLastCheckInAt: new Date().toISOString() });
    if (data.pluginUpdateAvailable && data.pluginUpdate) {
      const updateStatus = data.pluginUpdate.severity === "required" ? "update_required" : "update_available";
      await chrome.storage.local.set({ aiUsageGuardPluginUpdate: { ...data.pluginUpdate, updateStatus, seenAt: new Date().toISOString() } });
      await reportPluginUpdateStatus(data.pluginUpdate.latestVersion, updateStatus, true);
      await sendEvent({
        organizationId: enrollment.organizationId,
        deviceId,
        machineName: "browser-extension-host",
        browser: "chrome",
        pluginVersion: PLUGIN_VERSION,
        genAIApplication: "Browser Shield",
        genAIDomain: "local",
        eventType: "plugin_update_available",
        inputType: "browser",
        riskLevel: "low",
        detectedCategories: [],
        detectedCategoryCounts: {},
        actionTaken: "detected",
        policyId: stored.aiUsageGuardPolicy?.policyId,
        policyVersion: stored.aiUsageGuardPolicy?.policyVersion,
        scanStatus: "update_available",
        metadata: { rawPromptCollected: false, rawFileCollected: false, safePromptCollected: false, currentVersion: PLUGIN_VERSION, latestAvailableVersion: data.pluginUpdate.latestVersion, severity: data.pluginUpdate.severity }
      });
    } else {
      await chrome.storage.local.remove("aiUsageGuardPluginUpdate");
      await reportPluginUpdateStatus(PLUGIN_VERSION, "up_to_date", false);
    }
    if (data.policy && data.policyUpdateAvailable !== false) {
      if (!isValidPolicyEnvelope(data.policy)) throw new Error("invalid_policy_schema");
      await chrome.storage.local.set({ aiUsageGuardPolicy: data.policy, aiUsageGuardPolicyAppliedAt: new Date().toISOString() });
      await reportPolicyStatus(data.policy.policyId, data.policy.policyVersion, "applied");
      await sendEvent({
        organizationId: enrollment.organizationId,
        deviceId,
        machineName: "browser-extension-host",
        browser: "chrome",
        pluginVersion: PLUGIN_VERSION,
        genAIApplication: "Browser Shield",
        genAIDomain: "local",
        eventType: "policy_applied",
        inputType: "policy",
        riskLevel: "low",
        detectedCategories: [],
        detectedCategoryCounts: {},
        actionTaken: "allowed",
        policyId: data.policy.policyId,
        policyName: data.policy.policyName || data.policy.policyJson?.policyName,
        policyVersion: data.policy.policyVersion,
        policyMode: data.policy.policyJson?.mode,
        scanStatus: "applied",
        metadata: { rawPromptCollected: false, rawFileCollected: false, safePromptCollected: false, scanEngineVersion: PLUGIN_VERSION }
      });
    }
  } catch (error) {
    if (String(error?.message || error).includes("invalid_policy_schema")) {
      const storedAfterFailure = await chrome.storage.local.get(["aiUsageGuardPolicy"]);
      await reportPolicyStatus(storedAfterFailure.aiUsageGuardPolicy?.policyId || enrollment.defaultPolicyId, storedAfterFailure.aiUsageGuardPolicy?.policyVersion || "unknown", "failed", "invalid_policy_schema").catch(() => undefined);
    }
    await sendEvent({
      organizationId: enrollment.organizationId,
      deviceId,
      machineName: "browser-extension-host",
      browser: "chrome",
      pluginVersion: PLUGIN_VERSION,
      genAIApplication: "Browser Shield",
      genAIDomain: "local",
      eventType: "policy_sync_failed",
      inputType: "policy",
      riskLevel: "low",
      detectedCategories: [],
      detectedCategoryCounts: {},
      actionTaken: "failed",
      policyId: stored.aiUsageGuardPolicy?.policyId || enrollment.defaultPolicyId,
      policyVersion: stored.aiUsageGuardPolicy?.policyVersion,
      scanStatus: "failed",
      scanFailureReason: String(error?.message || error).includes("invalid_policy_schema") ? "invalid_policy_schema" : "check_in_failed",
      metadata: { rawPromptCollected: false, rawFileCollected: false, safePromptCollected: false, scanEngineVersion: PLUGIN_VERSION }
    });
  }
}

function isValidPolicyEnvelope(policy) {
  if (!policy || typeof policy !== "object") return false;
  if (!policy.policyId || !policy.policyVersion || !policy.policyJson || typeof policy.policyJson !== "object") return false;
  if (policy.policyJson.storeRawPrompt === true || policy.policyJson.storeRawFileContent === true) return false;
  if (policy.policyJson.enabled === false) return true;
  if (!policy.policyJson.mode && !policy.policyJson.promptScanning && !policy.policyJson.fileScanning) return false;
  return true;
}

async function reportPolicyStatus(policyId, policyVersion, status, errorMessage) {
  const enrollment = await loadEnrollment();
  const stored = await chrome.storage.local.get(["aiUsageGuardDeviceId"]);
  await fetch(enrollment.serverUrl + "/api/v1/endpoints/policy-status", {
    method: "POST",
    headers: { "content-type": "application/json", "x-enrollment-token": enrollment.enrollmentToken, "x-organization-id": enrollment.organizationId },
    body: JSON.stringify({ organizationId: enrollment.organizationId, deviceId: stored.aiUsageGuardDeviceId, policyId, policyVersion, status, appliedAt: status === "applied" ? new Date().toISOString() : null, errorMessage: errorMessage || null })
  });
}

async function reportPluginUpdateStatus(latestAvailableVersion, updateStatus, acknowledged) {
  const enrollment = await loadEnrollment();
  const stored = await chrome.storage.local.get(["aiUsageGuardDeviceId"]);
  await fetch(enrollment.serverUrl + "/api/v1/browser-plugin/update-status", {
    method: "POST",
    headers: { "content-type": "application/json", "x-enrollment-token": enrollment.enrollmentToken, "x-organization-id": enrollment.organizationId },
    body: JSON.stringify({ organizationId: enrollment.organizationId, deviceId: stored.aiUsageGuardDeviceId, currentVersion: PLUGIN_VERSION, latestAvailableVersion, updateStatus, acknowledged: Boolean(acknowledged), browser: "chrome" })
  });
}

function containsForbiddenField(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsForbiddenField);
  return Object.entries(value).some(([key, child]) => FORBIDDEN_FIELDS.includes(key) || containsForbiddenField(child));
}

async function sendEvent(payload) {
  if (containsForbiddenField(payload)) {
    console.warn("Event rejected because it contained forbidden raw content fields.");
    return;
  }
  const enrollment = await loadEnrollment();
  try {
    await fetch(enrollment.serverUrl + "/api/v1/events", {
      method: "POST",
      headers: { "content-type": "application/json", "x-enrollment-token": enrollment.enrollmentToken, "x-organization-id": enrollment.organizationId },
      body: JSON.stringify(payload)
    });
  } catch {
    const stored = await chrome.storage.local.get(["aiUsageGuardQueue"]);
    const queue = Array.isArray(stored.aiUsageGuardQueue) ? stored.aiUsageGuardQueue : [];
    queue.push({ payload, attempts: 0, nextAttemptAt: Date.now() });
    await chrome.storage.local.set({ aiUsageGuardQueue: queue.slice(-500) });
  }
}

async function flushQueue() {
  const stored = await chrome.storage.local.get(["aiUsageGuardQueue"]);
  const queue = Array.isArray(stored.aiUsageGuardQueue) ? stored.aiUsageGuardQueue : [];
  const remaining = [];
  for (const item of queue) {
    if (item.nextAttemptAt > Date.now()) {
      remaining.push(item);
      continue;
    }
    try {
      await sendEvent(item.payload);
    } catch {
      const attempts = item.attempts + 1;
      if (attempts < 10) remaining.push({ ...item, attempts, nextAttemptAt: Date.now() + 60000 * 2 ** Math.min(attempts, 8) });
    }
  }
  await chrome.storage.local.set({ aiUsageGuardQueue: remaining.slice(-500) });
}

chrome.runtime.onInstalled.addListener(() => {
  checkIn().catch(() => undefined);
  chrome.alarms.create(CHECKIN_ALARM, { periodInMinutes: 5 });
  chrome.alarms.create(QUEUE_ALARM, { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(() => {
  checkIn().catch(() => undefined);
  chrome.alarms.create(CHECKIN_ALARM, { periodInMinutes: 5 });
  chrome.alarms.create(QUEUE_ALARM, { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CHECKIN_ALARM) checkIn().catch(() => undefined);
  if (alarm.name === QUEUE_ALARM) flushQueue().catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "AIUG_EVENT") {
    sendEvent(message.payload).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "AIUG_GET_POLICY") {
    chrome.storage.local.get(["aiUsageGuardPolicy"]).then((stored) => sendResponse({ policy: stored.aiUsageGuardPolicy || null }));
    return true;
  }
  if (message?.type === "AIUG_CHECK_IN_NOW") {
    checkIn().then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }
  return false;
});
`;
}

function contentScriptJs(pluginVersion = "0.7.1") {
  return `
(function () {
  "use strict";

  const PLUGIN_VERSION = "${pluginVersion}";
  const SCAN_ENGINE_VERSION = "${pluginVersion}";
  const FORBIDDEN_FIELDS = ["rawPrompt", "promptText", "prompt", "fileContent", "fileText", "documentText", "extractedText", "ocrText", "screenshot", "password", "passwordValue", "token", "tokenValue", "apiKey", "apiKeyValue", "secret", "secretValue", "privateKey", "piiValue", "detectedValue", "rawValue"];
  const CHATGPT_HOSTS = ["chatgpt.com", "chat.openai.com"];
  const TEXT_FILE_TYPES = new Set(["txt", "csv", "json", "md", "log", "xml"]);
  const BEST_EFFORT_DOCUMENT_TYPES = new Set(["pdf", "docx", "xlsx"]);
  const IMAGE_FILE_TYPES = new Set(["png", "jpg", "jpeg", "webp"]);
  const CATEGORY_LABELS = {
    email: "Email address",
    phone: "Phone number",
    customer_name: "Customer name",
    employee_name: "Employee name",
    government_id: "Government ID / Social Security-like identifier",
    aadhaar: "India Aadhaar identifier",
    pan: "India PAN identifier",
    passport: "Passport-like identifier",
    bank_account: "Bank account identifier",
    routing_number: "Routing number",
    iban: "IBAN",
    payment_card: "Credit card number",
    api_key: "API key",
    access_token: "Access token",
    secret_key: "Secret key",
    private_key: "Private key"
  };
  const PLACEHOLDERS = {
    email: "[Email Address]",
    phone: "[Phone Number]",
    government_id: "[Government ID]",
    ssn: "[Government ID]",
    national_id: "[Government ID]",
    tax_id: "[Tax ID]",
    passport: "[Passport Number]",
    bank_account: "[Bank Account Number]",
    payment_card: "[Payment Card Number]",
    iban: "[IBAN]",
    swift_bic: "[SWIFT/BIC]",
    api_key: "[API Key]",
    password: "[Password]",
    token: "[Token]",
    jwt: "[Token]",
    access_token: "[Token]",
    secret_key: "[API Key]",
    private_key: "[Private Key]",
    address: "[Address]",
    customer_name: "[Customer Name]",
    employee_name: "[Employee Name]",
    internal_system: "[Internal System]",
    medical_record: "[Medical Record]",
    custom_sensitive_term: "[Sensitive Term]"
  };
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
  const SAFE_PLACEHOLDER_SET = new Set(SAFE_PLACEHOLDERS.map((value) => value.toLowerCase()));
  const CONTEXT_ONLY_LABELS = new Set([
    "aadhaar",
    "aadhar",
    "social security",
    "government id",
    "bank account",
    "account number",
    "email address",
    "phone number",
    "verification",
    "identity verification",
    "kyc",
    "customer",
    "account closure",
    "account closer",
    "bank account number"
  ]);
  const CATEGORY_PRIORITY = {
    private_key: 100,
    api_key: 95,
    access_token: 94,
    secret_key: 93,
    payment_card: 90,
    government_id: 80,
    aadhaar: 79,
    pan: 78,
    passport: 77,
    bank_account: 75,
    routing_number: 74,
    iban: 73,
    customer_name: 65,
    employee_name: 64,
    email: 60,
    phone: 40
  };
  const DEFAULT_POLICY = {
    policyName: "Default Sensitive Data Protection",
    mode: "active",
    enabled: true,
    defaultAction: "warn",
    unknownGenAIAppAction: "block",
    reportEvents: true,
    storeRawPrompt: false,
    storeRawFileContent: false,
    promptScanning: { enabled: true, enabledCategories: ["email", "phone", "government_id", "bank_account", "payment_card", "api_key", "access_token", "secret_key", "password", "token", "private_key"] },
    piiDetection: { enabled: true },
    onPiiDetected: { promptAction: "block", fileUploadAction: "block" },
    fileScanning: { enabled: true, maxFileSizeToScanMB: 25, supportedTypes: ["txt", "csv", "json", "xml", "log", "pdf", "docx", "xlsx", "png", "jpg", "jpeg", "webp"], onUnsupportedFileType: "warn", onFileTooLarge: "block", onScanFailure: "block", ocrEnabled: false },
    applications: [
      { appName: "ChatGPT", appType: "browser", domains: ["chatgpt.com", "chat.openai.com"], instanceType: "personal", appStatus: "restricted", piiHandling: "block", fileUploadHandling: "block", allowedDataCategories: ["business_general"], blockedDataCategories: ["government_id", "bank_account", "payment_card", "api_key", "access_token", "secret_key", "password", "token", "private_key"] },
      { appName: "Microsoft Copilot", appType: "browser_and_desktop", domains: ["copilot.microsoft.com"], instanceType: "enterprise", appStatus: "approved", piiHandling: "warn", fileUploadHandling: "warn", allowedDataCategories: ["business_general", "internal_low_risk"], blockedDataCategories: ["api_key", "access_token", "secret_key", "password", "token", "private_key"] }
    ],
    riskActions: { low: "allow", medium: "warn", high: "block", critical: "block" },
    userOverride: { enabled: false, allowForRiskLevels: ["low", "medium"], requireJustification: true },
    customSensitiveTerms: [],
    education: { enabled: true, triggerAfterRiskEvents: 3, lookbackDays: 7 }
  };
  const apps = [
    { name: "ChatGPT", domain: "chatgpt.com" },
    { name: "ChatGPT", domain: "chat.openai.com" },
    { name: "Claude", domain: "claude.ai" },
    { name: "Microsoft Copilot", domain: "copilot.microsoft.com" },
    { name: "Gemini", domain: "gemini.google.com" },
    { name: "Perplexity", domain: "perplexity.ai" },
    { name: "Poe", domain: "poe.com" },
    { name: "Grok", domain: "grok.com" },
    { name: "NotebookLM", domain: "notebooklm.google.com" }
  ];
  const app = apps.find((candidate) => location.hostname.includes(candidate.domain));
  if (!app) return;
  const isChatGpt = CHATGPT_HOSTS.some((host) => location.hostname.includes(host));
  let lastFileDecision = null;
  let allowNextSubmit = false;
  let safeReplacementPending = false;
  let currentPolicy = DEFAULT_POLICY;
  let currentThemeMode = "system";

  chrome.storage.local.get(["aiUsageGuardDebug", "debug", "aiUsageGuardPolicy", "aiUsageGuardTheme"]).then((stored) => {
    currentPolicy = stored.aiUsageGuardPolicy?.policyJson || DEFAULT_POLICY;
    currentThemeMode = stored.aiUsageGuardTheme || "system";
    if (stored.aiUsageGuardDebug === undefined && stored.debug === undefined) chrome.storage.local.set({ aiUsageGuardDebug: false });
    debugLog("content script loaded", { site: location.hostname, app: app.name });
  }).catch(() => undefined);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.aiUsageGuardPolicy) currentPolicy = changes.aiUsageGuardPolicy.newValue?.policyJson || DEFAULT_POLICY;
    if (area === "local" && changes.aiUsageGuardTheme) currentThemeMode = changes.aiUsageGuardTheme.newValue || "system";
  });

  function debugLog(message, details) {
    chrome.storage.local.get(["aiUsageGuardDebug", "debug"]).then((stored) => {
      if (stored.aiUsageGuardDebug || stored.debug) console.debug("[AI Usage Guard]", message, details || {});
    }).catch(() => undefined);
  }

  function effectiveTheme() {
    if (currentThemeMode === "light" || currentThemeMode === "dark") return currentThemeMode;
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  }

  function themeTokens() {
    const dark = effectiveTheme() === "dark";
    return dark ? {
      bg: "#020617",
      surface: "#0f172a",
      surfaceMuted: "#111827",
      border: "#334155",
      text: "#f8fafc",
      muted: "#cbd5e1",
      accent: "#14b8a6",
      accentSoft: "#134e4a",
      danger: "#fb7185",
      warning: "#fbbf24",
      success: "#86efac",
      overlay: "rgba(2,6,23,.72)",
      shadow: "0 24px 80px rgba(0,0,0,.45)"
    } : {
      bg: "#f1f5f9",
      surface: "#ffffff",
      surfaceMuted: "#f8fafc",
      border: "#cbd5e1",
      text: "#0f172a",
      muted: "#64748b",
      accent: "#0f766e",
      accentSoft: "#ecfdf5",
      danger: "#be123c",
      warning: "#b45309",
      success: "#166534",
      overlay: "rgba(15,23,42,.42)",
      shadow: "0 24px 80px rgba(15,23,42,.28)"
    };
  }

  function aiugButtonStyle(variant) {
    const t = themeTokens();
    if (variant === "primary") return "border:0;border-radius:8px;background:" + t.accent + ";color:#fff;font-weight:800;padding:10px 14px;cursor:pointer;";
    if (variant === "danger") return "border:0;border-radius:8px;background:" + t.danger + ";color:#fff;font-weight:800;padding:10px 14px;cursor:pointer;";
    if (variant === "warning") return "border:0;border-radius:8px;background:" + t.warning + ";color:#111827;font-weight:800;padding:10px 14px;cursor:pointer;";
    return "border:1px solid " + t.border + ";border-radius:8px;background:" + t.surface + ";color:" + t.text + ";font-weight:700;padding:10px 14px;cursor:pointer;";
  }

  function luhn(value) {
    const digits = value.replace(/\\D/g, "");
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

  function addMatches(counts, category, matches) {
    const count = Array.isArray(matches) ? matches.length : matches ? 1 : 0;
    if (count) counts[category] = (counts[category] || 0) + count;
  }

  function riskLevelForCategory(category) {
    if (["api_key", "access_token", "secret_key", "private_key", "payment_card"].includes(category)) return "critical";
    if (["government_id", "aadhaar", "pan", "passport", "bank_account", "routing_number", "iban"].includes(category)) return "high";
    if (["email", "phone"].includes(category)) return "medium";
    return "low";
  }

  function findSafePlaceholderRanges(text) {
    const ranges = [];
    for (const placeholder of SAFE_PLACEHOLDERS) {
      let index = text.indexOf(placeholder);
      while (index !== -1) {
        ranges.push({ start: index, end: index + placeholder.length });
        index = text.indexOf(placeholder, index + placeholder.length);
      }
    }
    return ranges.sort((a, b) => a.start - b.start);
  }

  function isInsideSafePlaceholder(text, start, end) {
    return findSafePlaceholderRanges(text).some((range) => start >= range.start && end <= range.end);
  }

  function isSafePlaceholderValue(value) {
    return SAFE_PLACEHOLDER_SET.has(String(value || "").trim().toLowerCase());
  }

  function isContextOnlyValue(value) {
    return CONTEXT_ONLY_LABELS.has(String(value || "").trim().replace(/[\\s:.,#-]+$/g, "").toLowerCase());
  }

  function hasActualSensitiveValue(category, value) {
    const normalized = String(value || "").trim();
    if (!normalized || isSafePlaceholderValue(normalized) || isContextOnlyValue(normalized)) return false;
    if (["email", "api_key", "access_token", "secret_key", "private_key", "payment_card", "iban", "pan"].includes(category)) return true;
    if (["phone", "government_id", "aadhaar", "passport", "bank_account", "routing_number"].includes(category)) return /\\d/.test(normalized);
    return true;
  }

  function addFinding(findings, category, value, start, end) {
    if (!value || start < 0 || end <= start) return;
    if (isInsideSafePlaceholder(findings.sourceText || "", start, end)) return;
    if (!hasActualSensitiveValue(category, value)) return;
    findings.push({
      category,
      label: CATEGORY_LABELS[category] || category,
      riskLevel: riskLevelForCategory(category),
      confidence: "high",
      value,
      start,
      end,
      placeholder: PLACEHOLDERS[category] || "[Sensitive Value]"
    });
  }

  function addRegexFindings(findings, text, category, regex, validator) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const value = match[0];
      if (!isInsideSafePlaceholder(text, match.index, match.index + value.length) && (!validator || validator(value))) addFinding(findings, category, value, match.index, match.index + value.length);
      if (match.index === regex.lastIndex) regex.lastIndex += 1;
    }
  }

  function addContextValueFindings(findings, text, category, regex, validator) {
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

  function reportingSafeFromFindings(findings) {
    const accepted = [];
    const ordered = [...findings].sort((a, b) => (CATEGORY_PRIORITY[b.category] || 0) - (CATEGORY_PRIORITY[a.category] || 0) || a.start - b.start);
    for (const finding of ordered) {
      const overlaps = accepted.some((acceptedFinding) => finding.start < acceptedFinding.end && finding.end > acceptedFinding.start);
      if (!overlaps) accepted.push(finding);
    }
    const counts = {};
    for (const finding of accepted) counts[finding.category] = (counts[finding.category] || 0) + 1;
    return {
      findings: accepted.sort((a, b) => a.start - b.start),
      counts,
      detectedCategories: Object.keys(counts)
    };
  }

  function addTableAwareFindings(findings, text) {
    const lines = String(text || "").split(/\\r?\\n/).map((line) => line.trim()).filter(Boolean);
    for (let index = 0; index < Math.min(lines.length - 1, 40); index += 1) {
      const delimiter = detectTableDelimiter(lines[index]);
      if (!delimiter) continue;
      const headers = splitTableRow(lines[index], delimiter);
      const categoryByColumn = headers.map(categoryForTableHeader);
      if (!categoryByColumn.some(Boolean)) continue;
      let searchFrom = text.indexOf(lines[index]) + lines[index].length;
      for (const rowLine of lines.slice(index + 1, index + 26)) {
        if (!rowLine.includes(delimiter)) break;
        const values = splitTableRow(rowLine, delimiter);
        const rowStart = text.indexOf(rowLine, Math.max(0, searchFrom));
        searchFrom = rowStart >= 0 ? rowStart + rowLine.length : searchFrom;
        values.forEach((value, columnIndex) => {
          const category = categoryByColumn[columnIndex];
          const cleanValue = value.trim();
          if (!category || !cleanValue || isContextOnlyValue(cleanValue) || isSafePlaceholderValue(cleanValue)) return;
          const localIndex = rowLine.indexOf(value);
          const start = rowStart >= 0 && localIndex >= 0 ? rowStart + localIndex : -1;
          addFinding(findings, category, cleanValue, start, start + cleanValue.length);
        });
      }
    }
  }

  function detectTableDelimiter(line) {
    if ((line.match(/\\|/g) || []).length >= 1) return "|";
    if ((line.match(/,/g) || []).length >= 1) return ",";
    if ((line.match(/\\t/g) || []).length >= 1) return "\\t";
    return "";
  }

  function splitTableRow(line, delimiter) {
    return delimiter === "," ? parseCsvLine(line) : line.split(delimiter).map((value) => value.trim());
  }

  function parseCsvLine(line) {
    const values = [];
    let current = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  }

  function categoryForTableHeader(header) {
    const normalized = String(header || "").trim().toLowerCase();
    if (/^(name|customer\\s+name|patient\\s+name|contact\\s+name)$/.test(normalized)) return "customer_name";
    if (/employee\\s+name/.test(normalized)) return "employee_name";
    if (/^(ssn|social\\s+security\\s+number|social\\s+security|government\\s+id|national\\s+id|tax\\s+id|passport|aadhaar|aadhar)$/.test(normalized)) return "government_id";
    if (/mobile|phone|telephone/.test(normalized)) return "phone";
    if (/email/.test(normalized)) return "email";
    if (/account\\s+number|bank\\s+account/.test(normalized)) return "bank_account";
    return "";
  }

  function scanSensitiveContent(text) {
    const normalized = text || "";
    const findings = [];
    findings.sourceText = normalized;
    addTableAwareFindings(findings, normalized);
    addRegexFindings(findings, normalized, "email", /[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi);
    addRegexFindings(findings, normalized, "phone", /(?:\\+?\\d{1,3}[-.\\s]?)?(?:\\(?\\d{2,4}\\)?[-.\\s]?){2,4}\\d{3,4}\\b/g);
    addRegexFindings(findings, normalized, "government_id", /\\b\\d{3}-\\d{2}-\\d{4}\\b/g);
    addContextValueFindings(findings, normalized, "government_id", /(\\b(?:social\\s+security|ssn|government\\s+id|national\\s+id|tax\\s+id)\\b[\\s\\S]{0,80}?[:#]?\\s*)([A-Z0-9][A-Z0-9-]{4,30}\\b)/gi, (value) => /\\d/.test(value));
    addContextValueFindings(findings, normalized, "aadhaar", /(\\b(?:aadhaar|aadhar)\\b[\\s\\S]{0,80}?[:#]?\\s*)(\\d{4}[ -]?\\d{4}[ -]?\\d{4}\\b)/gi);
    addRegexFindings(findings, normalized, "pan", /\\b[A-Z]{5}\\d{4}[A-Z]\\b/g);
    addContextValueFindings(findings, normalized, "passport", /(\\bpassport\\b[\\s\\S]{0,80}?[:#]?\\s*)([A-Z][0-9A-Z]{5,12}\\b)/gi);
    addContextValueFindings(findings, normalized, "bank_account", /(\\b(?:bank\\s+account|account\\s+(?:id|number|no)|acct)\\b(?:\\s+(?:id|number|no|is)){0,2}[\\s:=-]*)([A-Z0-9][A-Z0-9 -]{5,30}\\b)/gi, (value) => /\\d/.test(value));
    addContextValueFindings(findings, normalized, "routing_number", /(\\b(?:routing|aba)\\b[\\s\\S]{0,40}?[:#]?\\s*)(\\d{9}\\b)/gi);
    addRegexFindings(findings, normalized, "iban", /\\b[A-Z]{2}\\d{2}[A-Z0-9]{11,30}\\b/g);
    addRegexFindings(findings, normalized, "api_key", /\\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{20,})\\b/g);
    addRegexFindings(findings, normalized, "access_token", /\\b(?:bearer\\s+)?eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\b/gi);
    addContextValueFindings(findings, normalized, "secret_key", /(\\b(?:secret|client_secret|access_token|token|api_key|apikey)\\s*[:=]\\s*)([^\\s,;]{8,})/gi);
    addRegexFindings(findings, normalized, "private_key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/g);
    addRegexFindings(findings, normalized, "payment_card", /\\b(?:\\d[ -]*?){13,19}\\b/g, luhn);
    return reportingSafeFromFindings(findings);
  }

  function generateSafePrompt(originalPrompt, findings, options) {
    const mode = options?.mode || "business_safe";
    if (mode === "business_safe") {
      const businessSafe = generateBusinessSafePrompt(originalPrompt || "");
      if (businessSafe) return businessSafe;
    }
    const sorted = [...(findings || [])]
      .filter((finding) => Number.isFinite(finding.start) && Number.isFinite(finding.end) && finding.end > finding.start)
      .filter((finding) => !isInsideSafePlaceholder(originalPrompt || "", finding.start, finding.end))
      .filter((finding) => !isSafePlaceholderValue(finding.value) && !isContextOnlyValue(finding.value))
      .sort((a, b) => b.start - a.start || (CATEGORY_PRIORITY[b.category] || 0) - (CATEGORY_PRIORITY[a.category] || 0) || b.end - a.end);
    let safePrompt = originalPrompt || "";
    let lastStart = safePrompt.length + 1;
    for (const finding of sorted) {
      if (finding.end > lastStart) continue;
      safePrompt = safePrompt.slice(0, finding.start) + (finding.placeholder || PLACEHOLDERS[finding.category] || "[Sensitive Value]") + safePrompt.slice(finding.end);
      lastStart = finding.start;
    }
    return safePrompt;
  }

  function generateBusinessSafePrompt(text) {
    const normalized = String(text || "").toLowerCase();
    if (/account\\s+(closure|closer|closed|blocked|status|verification)|bank\\s+account/.test(normalized)) {
      return "Write a professional email to [Customer Name] explaining that there is an issue with their account status and asking them to contact support or use the approved secure channel for next steps.";
    }
    if (/identity\\s+verification|aadhaar|aadhar|ssn|social\\s+security|kyc/.test(normalized)) {
      return "Write a professional email to [Customer Name] explaining that their identity verification failed and asking them to re-submit the required details through the approved secure channel.";
    }
    return "";
  }

  function policyActionToDecision(action) {
    return action === "block" ? "BLOCK" : action === "warn" || action === "redact" ? "WARN" : "ALLOW";
  }

  function strictestAction(actions) {
    const rank = { allow: 0, redact: 1, warn: 2, block: 3 };
    return actions.reduce((selected, action) => rank[action] > rank[selected] ? action : selected, "allow");
  }

  function findPolicyAppRule(policy) {
    const hostname = location.hostname.toLowerCase();
    return (policy.applications || []).find((rule) => {
      const nameMatches = (rule.appName || "").toLowerCase() === app.name.toLowerCase();
      const domainMatches = (rule.domains || []).some((domain) => hostname === domain.toLowerCase() || hostname.endsWith("." + domain.toLowerCase()));
      return nameMatches || domainMatches;
    });
  }

  function evaluatePolicy(inputType, scanResult, options) {
    const policy = currentPolicy || DEFAULT_POLICY;
    const counts = scanResult?.counts || scanResult || {};
    const categories = Object.keys(counts);
    const criticalCategories = ["api_key", "access_token", "secret_key", "private_key", "payment_card"];
    const highCategories = ["government_id", "aadhaar", "pan", "passport", "bank_account", "routing_number", "iban"];
    const riskLevel = categories.some((category) => criticalCategories.includes(category)) ? "critical" : categories.some((category) => highCategories.includes(category)) ? "high" : categories.length ? "medium" : "low";
    let policyAction = policy.defaultAction || "warn";
    if (inputType === "file_upload" && options?.scanStatus === "unsupported") policyAction = policy.fileScanning?.onUnsupportedFileType || policyAction;
    if (inputType === "file_upload" && options?.scanStatus === "failed") policyAction = policy.fileScanning?.onScanFailure || policyAction;
    if (inputType === "file_upload" && options?.fileSizeMB && options.fileSizeMB > (policy.fileScanning?.maxFileSizeToScanMB || 25)) policyAction = policy.fileScanning?.onFileTooLarge || policyAction;
    if (inputType === "file_upload" && (options?.scanStatus === "unsupported" || options?.scanStatus === "failed" || (options?.fileSizeMB && options.fileSizeMB > (policy.fileScanning?.maxFileSizeToScanMB || 25)))) {
      if (policy.mode === "monitor") policyAction = "allow";
      if (policy.mode === "passive" && policyAction === "block") policyAction = "warn";
      const action = policyActionToDecision(policyAction);
      return {
        action,
        categories,
        counts,
        findings: scanResult?.findings || [],
        safePrompt: options?.safePrompt,
        riskLevel,
        reason: options?.scanFailureReason === "ocr_not_available" ? "Image OCR not available. File cannot be verified." : options?.scanStatus === "unsupported" ? "File type is not supported for local scanning." : "File scan failed.",
        inputType,
        fileContentInspected: false,
        scanNote: options?.scanNote || null,
        allowUserOverride: false,
        requiresJustification: false
      };
    }
    if (policy.piiDetection?.enabled === false || categories.length === 0) {
      return {
        action: "ALLOW",
        categories: [],
        counts: {},
        findings: [],
        safePrompt: options?.safePrompt,
        riskLevel: "low",
        reason: "No sensitive data detected.",
        inputType,
        fileContentInspected: options?.fileContentInspected ?? null,
        scanNote: options?.scanNote || null,
        allowUserOverride: false,
        requiresJustification: false
      };
    }
    const appRule = findPolicyAppRule(policy);
    if (!policy.enabled) policyAction = "allow";
    else if (!appRule) policyAction = policy.unknownGenAIAppAction || "block";
    else {
      const appAction = inputType === "file_upload" ? policy.onPiiDetected?.fileUploadAction || appRule.fileUploadHandling || "warn" : policy.onPiiDetected?.promptAction || appRule.piiHandling || "warn";
      const categoryAction = categories.some((category) => (appRule.blockedDataCategories || []).includes(category)) ? "block" : appAction;
      const riskAction = policy.riskActions?.[riskLevel] || policy.defaultAction || "warn";
      const secretAction = categories.some((category) => ["api_key", "access_token", "secret_key", "password", "token", "private_key"].includes(category)) ? "block" : "allow";
      policyAction = strictestAction([appAction, categoryAction, riskAction, secretAction]);
    }
    if (policy.mode === "monitor") policyAction = "allow";
    if (policy.mode === "passive" && policyAction === "block") policyAction = "warn";
    const action = policyActionToDecision(policyAction);
    return {
      action,
      categories,
      counts,
      findings: scanResult?.findings || [],
      safePrompt: options?.safePrompt,
      riskLevel,
      reason: categories.length ? categories.map((category) => CATEGORY_LABELS[category] || category).join(", ") + " detected" : "No sensitive content detected",
      inputType,
      fileContentInspected: options?.fileContentInspected ?? null,
      scanNote: options?.scanNote || null,
      allowUserOverride: action !== "ALLOW" && Boolean(policy.userOverride?.enabled) && (policy.userOverride?.allowForRiskLevels || []).includes(riskLevel),
      requiresJustification: Boolean(policy.userOverride?.requireJustification)
    };
  }

  function actionTakenFor(action) {
    return action === "BLOCK" ? "blocked" : action === "WARN" ? "warned" : "allowed";
  }

  function containsForbiddenField(value) {
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some(containsForbiddenField);
    return Object.entries(value).some(([key, child]) => FORBIDDEN_FIELDS.includes(key) || containsForbiddenField(child));
  }

  function sendSafeEvent(payload) {
    if (containsForbiddenField(payload)) {
      console.warn("Event rejected because it contained forbidden raw content fields.");
      return;
    }
    chrome.runtime.sendMessage({ type: "AIUG_EVENT", payload });
  }

  async function buildBasePayload(eventType, inputType, categories, counts, actionTaken, riskLevel, extra) {
    const stored = await chrome.storage.local.get(["aiUsageGuardEnrollment", "aiUsageGuardPolicy", "aiUsageGuardDeviceId"]);
    const enrollment = stored.aiUsageGuardEnrollment;
    if (!enrollment) return null;
    const policy = stored.aiUsageGuardPolicy;
    return {
      organizationId: enrollment.organizationId,
      deviceId: stored.aiUsageGuardDeviceId || "browser-extension-device",
      machineName: "browser-extension-host",
      browser: "chrome",
      pluginVersion: PLUGIN_VERSION,
      genAIApplication: app.name,
      genAIDomain: app.domain,
      eventType,
      inputType,
      riskLevel,
      detectedCategories: categories,
      detectedCategoryCounts: counts,
      actionTaken,
      policyId: policy?.policyId || enrollment.defaultPolicyId,
      policyName: policy?.policyName || policy?.policyJson?.policyName || DEFAULT_POLICY.policyName,
      policyVersion: policy?.policyVersion,
      policyMode: policy?.policyJson?.mode || DEFAULT_POLICY.mode,
      fileType: extra?.fileType,
      fileSizeBucket: extra?.fileSizeBucket,
      scanStatus: extra?.scanStatus,
      scanFailureReason: extra?.scanFailureReason,
      userOverride: extra?.userOverride,
      userJustificationProvided: extra?.userJustificationProvided,
      timestamp: new Date().toISOString(),
      metadata: {
        rawPromptCollected: false,
        safePromptCollected: false,
        rawFileCollected: false,
        extractedTextCollected: false,
        ocrTextCollected: false,
        scanEngineVersion: SCAN_ENGINE_VERSION,
        queuedEventsPendingSync: extra?.queuedEventsPendingSync
      }
    };
  }

  async function reportDetectionEvent(event) {
    if ((currentPolicy || DEFAULT_POLICY).reportEvents === false) return;
    const payload = await buildBasePayload(
      event.eventType,
      event.inputType,
      event.detectedCategories || [],
      event.detectedCategoryCounts || {},
      event.actionTaken,
      event.riskLevel || "low",
      event
    );
    if (!payload) return;
    payload.metadata = { ...payload.metadata, ...(event.metadata || {}) };
    delete payload.metadata.rawPrompt;
    delete payload.metadata.promptText;
    delete payload.metadata.prompt;
    delete payload.metadata.safePrompt;
    delete payload.metadata.fileContent;
    delete payload.metadata.extractedText;
    delete payload.metadata.ocrText;
    sendSafeEvent(payload);
  }

  async function reportUsage() {
    await reportDetectionEvent({ eventType: "genai_app_detected", inputType: "app_usage", actionTaken: "detected", riskLevel: "low", scanStatus: "detected" });
    await reportDetectionEvent({ eventType: "genai_app_used", inputType: "app_usage", actionTaken: "detected", riskLevel: "low", scanStatus: "detected" });
    if (app.name === "Unknown AI Tool") await reportDetectionEvent({ eventType: "unknown_genai_app_detected", inputType: "app_usage", actionTaken: "detected", riskLevel: "medium", scanStatus: "detected" });
  }

  async function inspectText(text, sourceElement) {
    const decision = evaluatePolicy("prompt", scanSensitiveContent(text), { fileContentInspected: null });
    const counts = decision.counts;
    const categories = decision.categories;
    if (!categories.length) return;
    const riskLevel = decision.riskLevel;
    const actionTaken = actionTakenFor(decision.action);
    if (decision.action === "BLOCK" && sourceElement) {
      sourceElement.dataset.aiugBlocked = "true";
    }
    reportDetectionEvent({ eventType: "prompt_scanned", inputType: "prompt", detectedCategories: categories, detectedCategoryCounts: counts, actionTaken: "scanned", riskLevel, scanStatus: "scanned" }).catch(() => undefined);
    if (categories.length) reportDetectionEvent({ eventType: "sensitive_prompt_detected", inputType: "prompt", detectedCategories: categories, detectedCategoryCounts: counts, actionTaken, riskLevel, scanStatus: "sensitive_detected" }).catch(() => undefined);
  }

  function findChatGptPromptBox() {
    const selectors = [
      "#prompt-textarea",
      "[data-testid='prompt-textarea']",
      "textarea",
      "div[contenteditable='true']",
      "[role='textbox']"
    ];
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement || element.isContentEditable || element.getAttribute("role") === "textbox")) {
        return element;
      }
    }
    return null;
  }

  function promptTextFrom(element) {
    if (!element) return "";
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) return element.value || "";
    return element.textContent || "";
  }

  function setPromptInputValue(element, value) {
    if (!element) return;
    if ("value" in element) {
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.focus?.();
      return;
    }
    if (element.isContentEditable || element.getAttribute?.("role") === "textbox") {
      element.textContent = value;
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      element.focus?.();
    }
  }

  function isChatGptSendButton(target) {
    const button = target?.closest?.("button");
    if (!button) return false;
    const label = [button.getAttribute("aria-label"), button.getAttribute("data-testid"), button.textContent].filter(Boolean).join(" ").toLowerCase();
    return label.includes("send") || label.includes("submit") || button.matches("[data-testid='send-button'], [aria-label*='Send' i], button[type='submit']");
  }

  function renderCategoryList(categories) {
    return categories.map((category) => "<li>" + (CATEGORY_LABELS[category] || category) + "</li>").join("");
  }

  function showToast(message) {
    const t = themeTokens();
    document.getElementById("aiug-toast")?.remove();
    const toast = document.createElement("div");
    toast.id = "aiug-toast";
    toast.textContent = message;
    toast.style.cssText = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;border-radius:999px;background:" + t.accent + ";color:#fff;padding:10px 16px;font:700 13px system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:" + t.shadow + ";";
    document.documentElement.append(toast);
    setTimeout(() => toast.remove(), 2600);
  }

  function showPolicyDrawer(lastDecision) {
    const t = themeTokens();
    document.getElementById("aiug-policy-drawer")?.remove();
    const policy = currentPolicy || DEFAULT_POLICY;
    const drawer = document.createElement("aside");
    drawer.id = "aiug-policy-drawer";
    drawer.style.cssText = "position:fixed;right:0;top:0;bottom:0;z-index:2147483647;width:360px;max-width:calc(100vw - 24px);height:100vh;overflow:auto;background:" + t.surface + ";color:" + t.text + ";border-left:1px solid " + t.border + ";box-shadow:" + t.shadow + ";font:13px system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";
    const header = document.createElement("div");
    header.style.cssText = "position:sticky;top:0;background:" + t.surface + ";border-bottom:1px solid " + t.border + ";padding:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;";
    const title = document.createElement("strong");
    title.textContent = "Applied policy";
    title.style.cssText = "font-size:16px;";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.style.cssText = aiugButtonStyle("secondary");
    close.addEventListener("click", () => drawer.remove());
    header.append(title, close);
    const body = document.createElement("div");
    body.style.cssText = "padding:16px;display:grid;gap:10px;";
    const row = (label, value) => {
      const item = document.createElement("div");
      item.style.cssText = "border:1px solid " + t.border + ";border-radius:10px;padding:10px;background:" + t.surfaceMuted + ";";
      item.innerHTML = "<div style='color:" + t.muted + ";font-size:12px;margin-bottom:4px;'>" + label + "</div><div style='font-weight:750;'>" + value + "</div>";
      return item;
    };
    body.append(
      row("Policy", policy.policyName || "Default Sensitive Data Protection"),
      row("Enforcement mode", policy.mode || "active"),
      row("Prompt inspection", policy.promptScanning?.enabled === false ? "Disabled" : "Enabled"),
      row("File inspection", policy.fileScanning?.enabled === false ? "Disabled" : "Enabled"),
      row("PII detection", "Enabled"),
      row("Country coverage", "global"),
      row("Telemetry mode", "Metadata only"),
      row("Content stored", "No"),
      row("Last scan result", (lastDecision?.action || "ALLOW") + " · " + (lastDecision?.categories?.length ? lastDecision.categories.join(", ") : "None"))
    );
    drawer.append(header, body);
    document.documentElement.append(drawer);
  }

  async function applySafePrompt(promptBox, safePrompt) {
    const input = promptBox || findChatGptPromptBox();
    setPromptInputValue(input, safePrompt || "");
    input?.removeAttribute?.("data-aiug-blocked");
    lastFileDecision = null;
    safeReplacementPending = true;
    const rescan = scanSensitiveContent(promptTextFrom(input).trim());
    const decision = evaluatePolicy("prompt", rescan, { fileContentInspected: null, safePrompt: "" });
    const allowDecision = { ...decision, action: "ALLOW", riskLevel: "low", categories: [], counts: {}, findings: [], reason: "No sensitive data detected.", inputType: "prompt" };
    await storeLastDecision(allowDecision);
    await reportDetectionEvent({
      eventType: "prompt_replaced_with_safe_prompt",
      inputType: "prompt",
      detectedCategories: [],
      detectedCategoryCounts: {},
      actionTaken: "replaced",
      riskLevel: "none",
      scanStatus: "replaced",
      metadata: { rawPromptCollected: false, safePromptCollected: false }
    });
    showToast("Safe prompt applied. Review and send when ready.");
  }

  function showDecisionModal(decision, mode, promptBox, onSendAnyway) {
    const t = themeTokens();
    document.getElementById("aiug-block-modal")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "aiug-block-modal";
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483646;background:" + t.overlay + ";display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";
    const modal = document.createElement("div");
    modal.style.cssText = "width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 48px);overflow:auto;border-radius:14px;background:" + t.surface + ";color:" + t.text + ";box-shadow:" + t.shadow + ";padding:24px;";
    const title = document.createElement("h2");
    title.textContent = mode === "warn" ? "Sensitive content warning" : "Prompt blocked by AI Usage Guard";
    title.style.cssText = "margin:0 0 10px;font-size:20px;line-height:1.25;font-weight:700;";
    const body = document.createElement("p");
    body.textContent = mode === "warn" ? "This prompt may contain sensitive information. Review before sending." : "This prompt contains sensitive information that is not allowed by the applied policy.";
    body.style.cssText = "margin:0 0 18px;color:" + t.muted + ";font-size:14px;line-height:1.5;";
    const list = document.createElement("ul");
    list.innerHTML = renderCategoryList(decision.categories);
    list.style.cssText = "margin:0 0 18px;padding-left:20px;color:" + t.text + ";font-size:14px;line-height:1.6;";
    const safeSection = document.createElement("div");
    safeSection.style.cssText = "margin:0 0 18px;";
    const safeLabel = document.createElement("div");
    safeLabel.textContent = "Suggested safe prompt";
    safeLabel.style.cssText = "margin:0 0 8px;color:" + t.text + ";font-size:13px;font-weight:800;";
    const safeBox = document.createElement("textarea");
    safeBox.readOnly = true;
    safeBox.value = decision.safePrompt || "";
    safeBox.style.cssText = "box-sizing:border-box;width:100%;min-height:150px;resize:vertical;border:1px solid " + t.border + ";border-radius:10px;background:" + t.surfaceMuted + ";color:" + t.text + ";padding:12px;font:14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";
    const direct = document.createElement("button");
    direct.type = "button";
    direct.textContent = "Show direct redaction";
    direct.style.cssText = "margin-top:8px;border:0;background:transparent;color:" + t.accent + ";font-weight:800;padding:0;cursor:pointer;";
    direct.addEventListener("click", () => {
      safeBox.value = generateSafePrompt(promptTextFrom(promptBox || findChatGptPromptBox()).trim(), decision.findings, { mode: "placeholder_redaction" });
      direct.remove();
    });
    safeSection.append(safeLabel, safeBox, direct);
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;";
    const replace = document.createElement("button");
    replace.type = "button";
    replace.textContent = "Replace prompt";
    replace.style.cssText = aiugButtonStyle("primary");
    replace.addEventListener("click", async () => {
      await applySafePrompt(promptBox || findChatGptPromptBox(), safeBox.value || decision.safePrompt || "");
      overlay.remove();
    });
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy safe prompt";
    copy.style.cssText = "border:1px solid " + t.accent + ";border-radius:8px;background:" + t.accentSoft + ";color:" + t.accent + ";font-weight:800;padding:10px 14px;cursor:pointer;";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(decision.safePrompt || "");
        copy.textContent = "Copied";
        setTimeout(() => { copy.textContent = "Copy safe prompt"; }, 1400);
      } catch {
        safeBox.select();
        document.execCommand?.("copy");
        copy.textContent = "Copied";
      }
    });
    const back = document.createElement("button");
    back.type = "button";
    back.textContent = mode === "warn" ? "Go back" : "Edit prompt";
    back.style.cssText = aiugButtonStyle("secondary");
    back.addEventListener("click", () => {
      overlay.remove();
      (promptBox || findChatGptPromptBox())?.focus?.();
    });
    const policy = document.createElement("button");
    policy.type = "button";
    policy.textContent = "View policy";
    policy.style.cssText = aiugButtonStyle("secondary");
    policy.addEventListener("click", () => {
      showPolicyDrawer(decision);
    });
    actions.append(replace, copy, back, policy);
    if (mode === "warn" || (mode === "block" && decision.allowUserOverride)) {
      const send = document.createElement("button");
      send.type = "button";
      send.textContent = mode === "warn" ? "Send anyway" : "Send once anyway";
      send.style.cssText = aiugButtonStyle("warning");
      send.addEventListener("click", () => {
        overlay.remove();
        onSendAnyway?.();
      });
      actions.append(send);
    }
    modal.append(title, body, list, safeSection, actions);
    overlay.append(modal);
    document.documentElement.append(overlay);
  }

  function showFileDecisionModal(decision, mode, onRemove, onContinue) {
    const t = themeTokens();
    document.getElementById("aiug-file-modal")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "aiug-file-modal";
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483646;background:" + t.overlay + ";display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";
    const modal = document.createElement("div");
    modal.style.cssText = "width:min(520px,calc(100vw - 32px));max-height:calc(100vh - 48px);overflow:auto;border-radius:14px;background:" + t.surface + ";color:" + t.text + ";box-shadow:" + t.shadow + ";padding:24px;";
    const title = document.createElement("h2");
    title.textContent = mode === "warn" ? "Sensitive information detected in attached file" : "File upload blocked by AI Usage Guard";
    title.style.cssText = "margin:0 0 10px;font-size:20px;line-height:1.25;font-weight:800;";
    const body = document.createElement("p");
    body.textContent = mode === "warn" ? "This file may contain sensitive information. Review the policy before uploading." : "This file contains sensitive information that is not allowed by the applied policy.";
    body.style.cssText = "margin:0 0 18px;color:" + t.muted + ";font-size:14px;line-height:1.5;";
    const label = document.createElement("div");
    label.textContent = "Detected sensitive data";
    label.style.cssText = "margin:0 0 8px;color:" + t.text + ";font-size:13px;font-weight:800;";
    const list = document.createElement("ul");
    list.innerHTML = renderCategoryList(decision.categories || []);
    list.style.cssText = "margin:0 0 18px;padding-left:20px;color:" + t.text + ";font-size:14px;line-height:1.6;";
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove file";
    remove.style.cssText = aiugButtonStyle("danger");
    remove.addEventListener("click", () => {
      onRemove?.();
      overlay.remove();
    });
    const policyButton = document.createElement("button");
    policyButton.type = "button";
    policyButton.textContent = "View policy";
    policyButton.style.cssText = aiugButtonStyle("secondary");
    policyButton.addEventListener("click", () => showPolicyDrawer(decision));
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.style.cssText = aiugButtonStyle("secondary");
    cancel.addEventListener("click", () => overlay.remove());
    actions.append(remove, policyButton, cancel);
    if (mode === "warn") {
      const cont = document.createElement("button");
      cont.type = "button";
      cont.textContent = "Continue if policy allows";
      cont.style.cssText = aiugButtonStyle("warning");
      cont.addEventListener("click", () => {
        onContinue?.();
        overlay.remove();
      });
      actions.append(cont);
    }
    modal.append(title, body, label, list, actions);
    overlay.append(modal);
    document.documentElement.append(overlay);
  }

  async function storeLastDecision(decision) {
    await chrome.storage.local.set({
      aiUsageGuardLastDecision: {
        decision: decision.action,
        reason: decision.reason,
        genAIApplication: app.name,
        genAIDomain: app.domain,
        siteHostname: location.hostname,
        inputType: decision.inputType,
        riskLevel: decision.riskLevel,
        detectedCategories: decision.categories,
        detectedCategoryCounts: decision.counts,
        actionTaken: actionTakenFor(decision.action),
        fileContentInspected: decision.fileContentInspected,
        scanNote: decision.scanNote,
        timestamp: new Date().toISOString(),
        policy: currentPolicy || DEFAULT_POLICY
      }
    });
  }

  function continueOriginalSubmit(trigger) {
    allowNextSubmit = true;
    if (trigger?.button) trigger.button.click();
    else if (trigger?.form?.requestSubmit) trigger.form.requestSubmit();
    else if (trigger?.promptBox) {
      trigger.promptBox.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    }
    setTimeout(() => { allowNextSubmit = false; }, 1500);
  }

  function reportPromptDecision(decision, actionTakenOverride) {
    const actionTaken = actionTakenOverride || actionTakenFor(decision.action);
    const eventType = safeReplacementPending && decision.action === "ALLOW"
      ? "prompt_allowed_after_safe_replacement"
      : actionTaken === "user_override"
      ? "prompt_user_override"
      : decision.action === "BLOCK"
        ? "prompt_blocked"
        : decision.action === "WARN"
          ? "prompt_warned"
          : "prompt_allowed";
    reportDetectionEvent({
      eventType,
      inputType: "prompt",
      detectedCategories: decision.categories,
      detectedCategoryCounts: decision.counts,
      actionTaken,
      riskLevel: safeReplacementPending && decision.action === "ALLOW" ? "none" : decision.riskLevel,
      scanStatus: actionTaken,
      userOverride: actionTaken === "user_override",
      userJustificationProvided: false,
      metadata: { rawPromptCollected: false, safePromptCollected: false }
    }).catch(() => undefined);
    if (safeReplacementPending && decision.action === "ALLOW") safeReplacementPending = false;
    if (decision.categories.length) reportDetectionEvent({
      eventType: "sensitive_prompt_detected",
      inputType: "prompt",
      detectedCategories: decision.categories,
      detectedCategoryCounts: decision.counts,
      actionTaken,
      riskLevel: decision.riskLevel,
      scanStatus: "sensitive_detected",
      userOverride: actionTaken === "user_override"
    }).catch(() => undefined);
  }

  function enforcePromptBeforeSubmit(event, trigger) {
    if (!isChatGpt && !app) return false;
    if (allowNextSubmit) return false;
    const promptBox = findChatGptPromptBox();
    const text = promptTextFrom(promptBox).trim();
    const activePolicy = currentPolicy || DEFAULT_POLICY;
    const promptScan = activePolicy.promptScanning?.enabled !== false && activePolicy.piiDetection?.enabled !== false ? scanSensitiveContent(text) : { counts: {}, findings: [], detectedCategories: [] };
    const safePrompt = generateSafePrompt(text, promptScan.findings, { mode: "business_safe" });
    const promptDecision = evaluatePolicy("prompt", promptScan, { fileContentInspected: null, safePrompt });
    const decision = mergeDecisions(promptDecision, lastFileDecision);
    decision.safePrompt = safePrompt;
    storeLastDecision(decision).catch(() => undefined);
    debugLog("policy decision", { action: decision.action, categories: decision.categories, inputType: decision.inputType });
    reportDetectionEvent({ eventType: "prompt_scanned", inputType: "prompt", detectedCategories: decision.categories, detectedCategoryCounts: decision.counts, actionTaken: "scanned", riskLevel: decision.riskLevel, scanStatus: "scanned" }).catch(() => undefined);
    if (!decision.categories.length) {
      safeReplacementPending = false;
      promptBox?.removeAttribute?.("data-aiug-blocked");
      lastFileDecision = null;
      return false;
    }
    if (decision.action === "ALLOW") {
      reportPromptDecision(decision);
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if (decision.action === "BLOCK") {
      promptBox?.setAttribute?.("data-aiug-blocked", "true");
      showDecisionModal(decision, "block", promptBox, () => {
        reportPromptDecision(decision, "user_override");
        continueOriginalSubmit(trigger || { promptBox });
      });
    } else {
      showDecisionModal(decision, "warn", promptBox, () => {
        reportPromptDecision(decision, "user_override");
        continueOriginalSubmit(trigger || { promptBox });
      });
    }
    reportPromptDecision(decision);
    return true;
  }

  function mergeDecisions(promptDecision, fileDecision) {
    if (!fileDecision) return promptDecision;
    const counts = { ...promptDecision.counts };
    for (const [category, count] of Object.entries(fileDecision.counts || {})) counts[category] = (counts[category] || 0) + count;
    const categories = Object.keys(counts);
    const action = promptDecision.action === "BLOCK" || fileDecision.action === "BLOCK" ? "BLOCK" : promptDecision.action === "WARN" || fileDecision.action === "WARN" ? "WARN" : "ALLOW";
    const riskOrder = { low: 0, medium: 1, high: 2, critical: 3 };
    const riskLevel = riskOrder[fileDecision.riskLevel] > riskOrder[promptDecision.riskLevel] ? fileDecision.riskLevel : promptDecision.riskLevel;
    return {
      ...promptDecision,
      action,
      categories,
      counts,
      riskLevel,
      reason: [promptDecision.reason, fileDecision.reason].filter(Boolean).join("; "),
      inputType: fileDecision.categories?.length ? "file_upload" : promptDecision.inputType,
      fileContentInspected: fileDecision.fileContentInspected,
      scanNote: fileDecision.scanNote,
      safePrompt: promptDecision.safePrompt
    };
  }

  function watchPrompts() {
    document.addEventListener("pointerdown", (event) => {
      if (isChatGptSendButton(event.target)) enforcePromptBeforeSubmit(event, { button: event.target.closest("button") });
    }, true);
    document.addEventListener("mousedown", (event) => {
      if (isChatGptSendButton(event.target)) enforcePromptBeforeSubmit(event, { button: event.target.closest("button") });
    }, true);
    document.addEventListener("click", (event) => {
      if (isChatGptSendButton(event.target)) enforcePromptBeforeSubmit(event, { button: event.target.closest("button") });
    }, true);
    document.addEventListener("keydown", (event) => {
      const target = event.target;
      const isPromptTarget = target === findChatGptPromptBox() || target?.closest?.("#prompt-textarea, [data-testid='prompt-textarea'], [role='textbox']");
      if (isPromptTarget && event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && !event.isComposing) {
        enforcePromptBeforeSubmit(event, { promptBox: target });
      }
    }, true);
    document.addEventListener("paste", (event) => {
      const target = event.target;
      const isPromptTarget = target === findChatGptPromptBox() || target?.closest?.("#prompt-textarea, [data-testid='prompt-textarea'], [role='textbox']");
      if (isPromptTarget) {
        debugLog("paste event detected", { site: location.hostname });
        setTimeout(() => {
          const text = promptTextFrom(findChatGptPromptBox()).trim();
          if (text.length > 2) inspectText(text, findChatGptPromptBox()).catch(() => undefined);
        }, 0);
      }
    }, true);
    document.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement || target?.isContentEditable)) return;
      debugLog("detected input selector", { tag: target.tagName, role: target.getAttribute?.("role") });
      const text = target.isContentEditable ? target.textContent || "" : target.value || "";
      if (text.length > 2) inspectText(text, target).catch(() => undefined);
    }, true);
    document.addEventListener("submit", (event) => {
      debugLog("detected submit event", { site: location.hostname });
      if (enforcePromptBeforeSubmit(event, { form: event.target })) return;
      const blocked = event.target?.querySelector?.("[data-aiug-blocked='true']");
      if (blocked) {
        event.preventDefault();
        alert("AI Usage Guard blocked this submission based on active policy.");
      }
    }, true);
  }

  function fileSizeBucket(size) {
    return size < 1000000 ? "0-1MB" : size < 5000000 ? "1-5MB" : size < 25000000 ? "5-25MB" : "25MB+";
  }

  async function extractTextFromFile(file, fileType, policy) {
    if (TEXT_FILE_TYPES.has(fileType)) return { text: await file.text(), scanStatus: "completed", fileContentInspected: true, scanNote: "file content inspected locally" };
    if (IMAGE_FILE_TYPES.has(fileType)) {
      if (!policy.fileScanning?.ocrEnabled) return { text: "", scanStatus: "failed", scanFailureReason: "ocr_not_available", fileContentInspected: false, scanNote: "Image OCR not available. File cannot be verified." };
      return { text: "", scanStatus: "failed", scanFailureReason: "ocr_not_available", fileContentInspected: false, scanNote: "Image OCR not available. File cannot be verified." };
    }
    if (BEST_EFFORT_DOCUMENT_TYPES.has(fileType)) {
      const buffer = await file.arrayBuffer();
      if (fileType === "docx" || fileType === "xlsx") {
        const officeText = await extractOfficeText(buffer, fileType);
        if (officeText.trim().length > 4) return { text: officeText, scanStatus: "completed", fileContentInspected: true, scanNote: "office document text inspected locally" };
      }
      const decoded = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      const text = decoded
        .replace(/<[^>]+>/g, " ")
        .replace(/\\u0000/g, " ")
        .replace(/\\s+/g, " ")
        .trim();
      if (text.length > 4) return { text, scanStatus: "completed", fileContentInspected: true, scanNote: "document text inspected locally with best-effort parser" };
      return { text: "", scanStatus: "failed", scanFailureReason: "text_extraction_failed", fileContentInspected: false, scanNote: "Document text extraction failed" };
    }
    return { text: "", scanStatus: "unsupported", scanFailureReason: "unsupported_file_type", fileContentInspected: false, scanNote: "file content not inspected" };
  }

  async function extractOfficeText(buffer, fileType) {
    const entries = await readZipTextEntries(buffer);
    if (!entries.length) return "";
    const wanted = fileType === "docx"
      ? entries.filter((entry) => entry.name.startsWith("word/") && entry.name.endsWith(".xml"))
      : entries.filter((entry) => entry.name.startsWith("xl/") && entry.name.endsWith(".xml"));
    return wanted.map((entry) => xmlToText(entry.text)).join("\\n");
  }

  async function readZipTextEntries(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const entries = [];
    let offset = 0;
    while (offset + 30 < bytes.length && view.getUint32(offset, true) === 0x04034b50) {
      const compression = view.getUint16(offset + 8, true);
      const compressedSize = view.getUint32(offset + 18, true);
      const fileNameLength = view.getUint16(offset + 26, true);
      const extraLength = view.getUint16(offset + 28, true);
      const nameStart = offset + 30;
      const name = decoder.decode(bytes.slice(nameStart, nameStart + fileNameLength));
      const dataStart = nameStart + fileNameLength + extraLength;
      const dataEnd = dataStart + compressedSize;
      const payload = bytes.slice(dataStart, dataEnd);
      let text = "";
      if (compression === 0) text = decoder.decode(payload);
      if (compression === 8 && typeof DecompressionStream !== "undefined") {
        try {
          const stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
          text = await new Response(stream).text();
        } catch {
          text = "";
        }
      }
      if (text) entries.push({ name, text });
      offset = dataEnd;
    }
    return entries;
  }

  function xmlToText(xml) {
    return String(xml || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\\s+/g, " ")
      .trim();
  }

  async function scanFile(file) {
    const fileType = (file.name.split(".").pop() || "unknown").toLowerCase();
    const fileMeta = { fileType, fileSizeBucket: fileSizeBucket(file.size) };
    await reportDetectionEvent({ eventType: "file_scan_started", inputType: "file_upload", actionTaken: "scanned", riskLevel: "low", fileType, fileSizeBucket: fileMeta.fileSizeBucket, scanStatus: "started" });
    const policy = currentPolicy || DEFAULT_POLICY;
    if (policy.fileScanning?.enabled === false) return { ...evaluatePolicy("file_upload", {}, { fileContentInspected: false, scanNote: "file inspection disabled" }), fileMeta, scanStatus: "skipped", scanFailureReason: "file_inspection_disabled" };
    if (file.size / 1000000 > (policy.fileScanning?.maxFileSizeToScanMB || 25)) return { ...evaluatePolicy("file_upload", {}, { fileContentInspected: false, scanNote: "file too large", fileSizeMB: file.size / 1000000 }), fileMeta, scanStatus: "failed", scanFailureReason: "file_too_large" };
    if (!(policy.fileScanning?.supportedTypes || []).includes(fileType)) return { ...evaluatePolicy("file_upload", {}, { fileContentInspected: false, scanNote: "file content not inspected", scanStatus: "unsupported" }), fileMeta, scanStatus: "unsupported", scanFailureReason: "unsupported_file_type" };
    try {
      const extracted = await extractTextFromFile(file, fileType, policy);
      if (extracted.scanStatus !== "completed") {
        return { ...evaluatePolicy("file_upload", {}, { ...extracted, fileSizeMB: file.size / 1000000 }), fileMeta, scanStatus: extracted.scanStatus, scanFailureReason: extracted.scanFailureReason };
      }
      return { ...evaluatePolicy("file_upload", scanSensitiveContent(extracted.text), { fileContentInspected: true, scanNote: extracted.scanNote, fileSizeMB: file.size / 1000000 }), fileMeta, scanStatus: "completed" };
    } catch {
      return { ...evaluatePolicy("file_upload", {}, { fileContentInspected: false, scanNote: "file content not inspected", scanStatus: "failed", scanFailureReason: "read_failed" }), fileMeta, scanStatus: "failed", scanFailureReason: "read_failed" };
    }
  }

  function watchFiles() {
    document.addEventListener("change", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "file" || !target.files?.length) return;
      event.preventDefault();
      event.stopPropagation();
      let combined = null;
      for (const file of Array.from(target.files)) {
        const fileType = (file.name.split(".").pop() || "unknown").toLowerCase();
        const sizeBucket = fileSizeBucket(file.size);
        await reportDetectionEvent({ eventType: "file_attached", inputType: "file_upload", actionTaken: "detected", riskLevel: "low", fileType, fileSizeBucket: sizeBucket, scanStatus: "attached" });
        const fileDecision = await scanFile(file);
        combined = combined ? mergeDecisions(combined, fileDecision) : fileDecision;
        const actionTaken = actionTakenFor(fileDecision.action);
        await reportDetectionEvent({ eventType: "file_scanned", inputType: "file_upload", detectedCategories: fileDecision.categories, detectedCategoryCounts: fileDecision.counts, actionTaken: "scanned", riskLevel: fileDecision.riskLevel, fileType: fileDecision.fileMeta.fileType, fileSizeBucket: fileDecision.fileMeta.fileSizeBucket, scanStatus: fileDecision.scanStatus, scanFailureReason: fileDecision.scanFailureReason, metadata: { fileContentInspected: fileDecision.fileContentInspected, scanNote: fileDecision.scanNote, rawFileCollected: false, extractedTextCollected: false, ocrTextCollected: false } });
        if (fileDecision.scanStatus === "unsupported") await reportDetectionEvent({ eventType: "unsupported_file_type_detected", inputType: "file_upload", detectedCategories: fileDecision.categories, detectedCategoryCounts: fileDecision.counts, actionTaken: "unsupported", riskLevel: fileDecision.riskLevel, fileType: fileDecision.fileMeta.fileType, fileSizeBucket: fileDecision.fileMeta.fileSizeBucket, scanStatus: "unsupported", scanFailureReason: fileDecision.scanFailureReason });
        if (fileDecision.scanStatus === "failed") await reportDetectionEvent({ eventType: "file_scan_failed", inputType: "file_upload", detectedCategories: fileDecision.categories, detectedCategoryCounts: fileDecision.counts, actionTaken: "failed", riskLevel: fileDecision.riskLevel, fileType: fileDecision.fileMeta.fileType, fileSizeBucket: fileDecision.fileMeta.fileSizeBucket, scanStatus: "failed", scanFailureReason: fileDecision.scanFailureReason });
        if (fileDecision.categories.length) await reportDetectionEvent({ eventType: "sensitive_file_detected", inputType: "file_upload", detectedCategories: fileDecision.categories, detectedCategoryCounts: fileDecision.counts, actionTaken, riskLevel: fileDecision.riskLevel, fileType: fileDecision.fileMeta.fileType, fileSizeBucket: fileDecision.fileMeta.fileSizeBucket, scanStatus: fileDecision.scanStatus, scanFailureReason: fileDecision.scanFailureReason });
        await reportDetectionEvent({ eventType: fileDecision.action === "BLOCK" ? "file_upload_blocked" : fileDecision.action === "WARN" ? "file_upload_warned" : "file_upload_allowed", inputType: "file_upload", detectedCategories: fileDecision.categories, detectedCategoryCounts: fileDecision.counts, actionTaken, riskLevel: fileDecision.riskLevel, fileType: fileDecision.fileMeta.fileType, fileSizeBucket: fileDecision.fileMeta.fileSizeBucket, scanStatus: fileDecision.scanStatus, scanFailureReason: fileDecision.scanFailureReason });
      }
      lastFileDecision = combined;
      if (combined) {
        await storeLastDecision({ ...combined, inputType: "file_upload" });
        if (combined.action === "BLOCK") {
          target.value = "";
          showFileDecisionModal(combined, "block", () => { target.value = ""; });
        } else if (combined.action === "WARN") {
          showFileDecisionModal(combined, "warn", () => { target.value = ""; }, () => undefined);
        }
      }
    }, true);
  }

  chrome.storage.local.set({ aiUsageGuardEffectivePolicy: currentPolicy || DEFAULT_POLICY }).catch(() => undefined);

  reportUsage().catch(() => undefined);
  watchPrompts();
  watchFiles();
})();
`;
}

function popupHtml() {
  return "<!doctype html><html><head><meta charset='utf-8'><style>:root{--bg:#f1f5f9;--surface:#fff;--muted-surface:#f8fafc;--border:#e2e8f0;--text:#0f172a;--muted:#64748b;--accent:#0f766e;--accent-soft:#dcfce7;--success:#166534;--danger:#be123c;--warning:#b45309}.dark{--bg:#020617;--surface:#0f172a;--muted-surface:#111827;--border:#334155;--text:#f8fafc;--muted:#cbd5e1;--accent:#14b8a6;--accent-soft:#134e4a;--success:#86efac;--danger:#fb7185;--warning:#fbbf24}body{font:13px system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;width:340px;color:var(--text);background:var(--bg)}.wrap{padding:16px}.brand{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.brand strong{font-size:16px;color:var(--accent)}.badge{border-radius:999px;background:var(--accent-soft);color:var(--success);font-weight:700;padding:4px 8px}.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px;margin-top:10px;box-shadow:0 8px 24px rgba(15,23,42,.06)}.notice{border-color:var(--warning);background:rgba(251,191,36,.12)}.notice.required{border-color:var(--danger);background:rgba(251,113,133,.12)}h2{font-size:13px;margin:0 0 8px;color:var(--text)}.row{display:flex;justify-content:space-between;gap:12px;margin:6px 0}.label{color:var(--muted)}.value{font-weight:650;text-align:right}.muted{color:var(--muted)}.decision{font-weight:800}.BLOCK,.blocked{color:var(--danger)}.WARN,.warned{color:var(--warning)}.ALLOW,.allowed{color:var(--success)}select{border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);padding:6px 8px}</style></head><body><div class='wrap'><div class='brand'><strong>AI Usage Guard</strong><span class='badge'>Active</span></div><div class='card'><div class='row'><span class='label'>Theme</span><select id='theme'><option value='light'>Light</option><option value='dark'>Dark</option><option value='system'>System</option></select></div></div><div id='update'></div><div id='policy' class='card'>Loading policy...</div><div id='last' class='card'>No scan decision yet.</div></div><script src='popup.js'></script></body></html>";
}

function popupJs() {
  return `
(function () {
  "use strict";

  const fallbackPolicy = {
    policyName: "Default Sensitive Data Protection",
    mode: "active",
    promptScanning: { enabled: true },
    fileScanning: { enabled: true }
  };

  function yesNo(value) {
    return value ? "Enabled" : "Disabled";
  }

  function applyTheme(mode) {
    const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }

  function row(label, value, className) {
    return "<div class='row'><span class='label'>" + label + "</span><span class='value " + (className || "") + "'>" + value + "</span></div>";
  }

  function renderPolicy(policy) {
    const applied = policy || fallbackPolicy;
    document.getElementById("policy").innerHTML =
      "<h2>Applied Policy</h2>" +
      row("Status", "Active", "allowed") +
      row("Policy", applied.policyName || applied.name || fallbackPolicy.policyName) +
      row("Enforcement mode", applied.mode || "active") +
      row("Prompt inspection", yesNo(applied.promptScanning?.enabled !== false && applied.promptInspection !== false)) +
      row("File inspection", yesNo(applied.fileScanning?.enabled !== false && applied.fileInspection !== false)) +
      row("PII detection", "Enabled") +
      row("Country coverage", applied.countryCoverage || "global") +
      row("Government IDs", yesNo(applied.governmentIdDetection !== false)) +
      row("Financial accounts", yesNo(applied.financialAccountDetection !== false)) +
      row("Secrets", yesNo(applied.secretsDetection !== false)) +
      row("Telemetry mode", "Metadata only") +
      row("Content stored", "No");
  }

  function renderUpdateNotice(update) {
    const target = document.getElementById("update");
    if (!target) return;
    if (!update) {
      target.innerHTML = "";
      return;
    }
    const required = update.severity === "required" || update.updateStatus === "update_required";
    target.innerHTML =
      "<div class='card notice " + (required ? "required" : "") + "'>" +
      "<h2>" + (required ? "Plugin update required" : "Plugin update available") + "</h2>" +
      "<p class='muted'>A newer version is available. Contact your administrator.</p>" +
      row("Installed", "0.7.1") +
      row("Latest", update.latestVersion || update.latestAvailableVersion || "-") +
      row("Severity", update.severity || "recommended") +
      "</div>";
  }

  function renderLast(decision) {
    if (!decision) {
      document.getElementById("last").innerHTML = "<h2>Last Scan Result</h2><p class='muted'>No scan decision yet.</p>";
      return;
    }
    const categories = Array.isArray(decision.detectedCategories) && decision.detectedCategories.length ? decision.detectedCategories.join(", ") : "None";
    const inspected = decision.fileContentInspected === null || decision.fileContentInspected === undefined ? "N/A" : decision.fileContentInspected ? "Yes" : "No";
    document.getElementById("last").innerHTML =
      "<h2>Last Scan Result</h2>" +
      row("Decision", decision.decision || decision.actionTaken || "ALLOW", "decision " + (decision.decision || decision.actionTaken || "ALLOW")) +
      row("Site", decision.siteHostname || decision.genAIDomain || "Unknown") +
      row("Timestamp", decision.timestamp ? new Date(decision.timestamp).toLocaleString() : "Unknown") +
      row("Matched categories", categories) +
      row("Reason", decision.reason || "No sensitive content detected") +
      row("File content inspected", inspected) +
      (decision.scanNote ? row("Scan note", decision.scanNote) : "");
  }

  chrome.runtime.sendMessage({ type: "AIUG_CHECK_IN_NOW" }).catch(() => undefined);
  chrome.storage.local.get(["aiUsageGuardEffectivePolicy", "aiUsageGuardLastDecision", "aiUsageGuardPolicy", "aiUsageGuardTheme", "aiUsageGuardPluginUpdate"]).then((stored) => {
    const theme = stored.aiUsageGuardTheme || "system";
    applyTheme(theme);
    const themeSelect = document.getElementById("theme");
    if (themeSelect) {
      themeSelect.value = theme;
      themeSelect.addEventListener("change", () => {
        chrome.storage.local.set({ aiUsageGuardTheme: themeSelect.value });
        applyTheme(themeSelect.value);
      });
    }
    renderUpdateNotice(stored.aiUsageGuardPluginUpdate);
    renderPolicy(stored.aiUsageGuardEffectivePolicy || stored.aiUsageGuardPolicy?.policyJson || fallbackPolicy);
    renderLast(stored.aiUsageGuardLastDecision);
  }).catch(() => {
    renderPolicy(fallbackPolicy);
    renderLast(null);
  });
})();
`;
}

function optionsHtml() {
  return "<!doctype html><html><head><meta charset='utf-8'><style>:root{--bg:#f1f5f9;--surface:#fff;--border:#e2e8f0;--text:#0f172a;--muted:#64748b;--accent:#0f766e}.dark{--bg:#020617;--surface:#0f172a;--border:#334155;--text:#f8fafc;--muted:#cbd5e1;--accent:#14b8a6}body{font:14px system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;color:var(--text);background:var(--bg)}.wrap{max-width:760px;margin:0 auto;padding:32px}.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px}h1{margin:0 0 6px;font-size:24px}.muted{color:var(--muted)}label{display:grid;gap:8px;margin-top:18px;font-weight:700}select{max-width:260px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);padding:10px 12px}.badge{display:inline-flex;border-radius:999px;background:rgba(20,184,166,.14);color:var(--accent);font-weight:800;padding:4px 8px}</style></head><body><div class='wrap'><div class='card'><span class='badge'>Metadata only</span><h1>AI Usage Guard Options</h1><p class='muted'>This extension is managed by your administrator. Raw prompt and file collection are disabled by default.</p><label>Theme<select id='theme'><option value='light'>Light</option><option value='dark'>Dark</option><option value='system'>System</option></select></label></div></div><script src='options.js'></script></body></html>";
}

function optionsJs() {
  return `
(function () {
  "use strict";
  function applyTheme(mode) {
    const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }
  chrome.storage.local.get(["aiUsageGuardTheme"]).then((stored) => {
    const select = document.getElementById("theme");
    const theme = stored.aiUsageGuardTheme || "system";
    applyTheme(theme);
    select.value = theme;
    select.addEventListener("change", () => {
      chrome.storage.local.set({ aiUsageGuardTheme: select.value });
      applyTheme(select.value);
    });
  });
})();
`;
}
