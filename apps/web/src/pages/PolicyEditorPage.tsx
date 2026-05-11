import { FormEvent, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { Page } from "./EndpointsPage";

export default function PolicyEditorPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [policy, setPolicy] = useState<any>(null);
  const readOnly = policy?.status === "archived";

  useEffect(() => {
    if (id) api.get(`/policies/${id}`).then((res) => setPolicy(res.data.item));
  }, [id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const policyJson = {
      ...(policy?.policyJson ?? {}),
      enabled: true,
      mode: form.get("mode"),
      defaultAction: form.get("defaultAction"),
      unknownGenAIAppAction: form.get("unknownGenAIAppAction"),
      reportEvents: true,
      storeRawPrompt: false,
      storeRawFileContent: false,
      promptScanning: {
        enabled: form.get("promptScanningEnabled") === "on",
        enabledCategories: String(form.get("enabledCategories") ?? "").split(",").map((item) => item.trim()).filter(Boolean)
      },
      piiDetection: { enabled: form.get("piiDetectionEnabled") === "on" },
      onPiiDetected: {
        promptAction: form.get("onPiiPromptAction"),
        fileUploadAction: form.get("onPiiFileUploadAction")
      },
      applications: [{
        appName: String(form.get("appName") || searchParams.get("app") || "Selected AI Tool"),
        appType: "browser",
        domains: String(form.get("domains") ?? "").split(",").map((item) => item.trim()).filter(Boolean),
        instanceType: form.get("instanceType"),
        appStatus: form.get("appStatus"),
        piiHandling: form.get("piiHandling"),
        fileUploadHandling: form.get("fileUploadHandling"),
        allowedDataCategories: String(form.get("allowedDataCategories") ?? "").split(",").map((item) => item.trim()).filter(Boolean),
        blockedDataCategories: String(form.get("blockedDataCategories") ?? "").split(",").map((item) => item.trim()).filter(Boolean)
      }],
      fileScanning: {
        enabled: form.get("fileScanningEnabled") === "on",
        maxFileSizeToScanMB: Number(form.get("maxFileSizeToScanMB")),
        supportedTypes: String(form.get("supportedTypes") ?? "").split(",").map((item) => item.trim()).filter(Boolean),
        onUnsupportedFileType: form.get("onUnsupportedFileType"),
        onFileTooLarge: form.get("onFileTooLarge"),
        onScanFailure: form.get("onScanFailure"),
        ocrEnabled: form.get("ocrEnabled") === "on"
      },
      riskActions: { low: form.get("low"), medium: form.get("medium"), high: form.get("high"), critical: form.get("critical") },
      customSensitiveTerms: String(form.get("customSensitiveTerms") ?? "").split("\n").map((term) => term.trim()).filter(Boolean),
      userOverride: { enabled: form.get("userOverrideEnabled") === "on", allowForRiskLevels: String(form.get("allowForRiskLevels") ?? "").split(",").map((item) => item.trim()).filter(Boolean), requireJustification: form.get("requireJustification") === "on" },
      education: { enabled: form.get("educationEnabled") === "on", triggerAfterRiskEvents: Number(form.get("triggerAfterRiskEvents")), lookbackDays: Number(form.get("lookbackDays")) }
    };
    const body = { organizationId: policy?.organizationId ?? "org_acme_dental", name: form.get("name"), description: form.get("description"), policyJson };
    const saved = id ? await api.put(`/policies/${id}`, body) : await api.post("/policies", body);
    if (form.get("publish") === "true") {
      const published = await api.post(`/policies/${saved.data.item.id}/publish`);
      if (form.get("publishApplyTarget") === "organization") {
        await api.post(`/policies/${published.data.item.id}/assign`, { organizationId: published.data.item.organizationId, assignmentType: "organization", targetId: null, applyImmediately: true });
      }
      navigate(`/policies/${published.data.item.id}`);
      return;
    }
    navigate("/policies");
  }

  const json = policy?.policyJson ?? {};
  return (
    <Page title={id ? "Edit Policy" : "Policy Editor"} subtitle="Published policy edits save as a draft version. Raw prompt and raw file collection remain locked disabled.">
      {policy?.status === "published" && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">You are editing a published policy. Changes will create a new draft version.</div>}
      {readOnly && <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">This policy is archived and read-only.</div>}
      <form onSubmit={submit} className="card mt-4 grid gap-5 p-5 xl:grid-cols-2">
        <Field label="Name"><input name="name" defaultValue={policy?.name ?? "New AI Safety Policy"} className="input" disabled={readOnly} /></Field>
        <Field label="Description"><input name="description" defaultValue={policy?.description ?? "Policy for safe GenAI usage"} className="input" disabled={readOnly} /></Field>
        <Select label="Mode" name="mode" defaultValue={json.mode ?? "active"} options={["monitor", "passive", "active"]} />
        <Select label="Default action" name="defaultAction" defaultValue={json.defaultAction ?? "warn"} options={["allow", "warn", "block"]} />
        <Select label="Unknown GenAI app action" name="unknownGenAIAppAction" defaultValue={json.unknownGenAIAppAction ?? "block"} options={["allow", "warn", "block"]} />
        <Field label="Prompt categories enabled"><input name="enabledCategories" defaultValue={(json.promptScanning?.enabledCategories ?? ["email", "phone", "government_id", "bank_account", "payment_card", "api_key", "password", "token", "private_key"]).join(", ")} className="input" disabled={readOnly} /></Field>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"><input name="promptScanningEnabled" type="checkbox" defaultChecked={json.promptScanning?.enabled !== false} disabled={readOnly} /> Prompt scanning enabled</label>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"><input name="piiDetectionEnabled" type="checkbox" defaultChecked={json.piiDetection?.enabled !== false} disabled={readOnly} /> PII detection enabled</label>
        <Select label="When PII is detected in prompt" name="onPiiPromptAction" defaultValue={json.onPiiDetected?.promptAction ?? "block"} options={["allow", "warn", "block"]} />
        <Select label="When PII is detected in file upload" name="onPiiFileUploadAction" defaultValue={json.onPiiDetected?.fileUploadAction ?? "block"} options={["allow", "warn", "block"]} />
        <Field label="AI tool handling"><input name="appName" defaultValue={searchParams.get("app") ?? json.applications?.[0]?.appName ?? "ChatGPT"} className="input" placeholder="ChatGPT" disabled={readOnly} /></Field>
        <Field label="Domains"><input name="domains" defaultValue={(json.applications?.[0]?.domains ?? ["chatgpt.com", "chat.openai.com"]).join(", ")} className="input" disabled={readOnly} /></Field>
        <Select label="Instance type" name="instanceType" defaultValue={json.applications?.[0]?.instanceType ?? "personal"} options={["personal", "enterprise", "business", "unknown"]} />
        <Select label="App status" name="appStatus" defaultValue={json.applications?.[0]?.appStatus ?? "restricted"} options={["approved", "restricted", "blocked", "unknown"]} />
        <Select label="PII handling for this AI tool" name="piiHandling" defaultValue={json.applications?.[0]?.piiHandling ?? "block"} options={["allow", "warn", "block"]} />
        <Select label="File upload handling" name="fileUploadHandling" defaultValue={json.applications?.[0]?.fileUploadHandling ?? "block"} options={["allow", "warn", "block"]} />
        <Field label="Allowed categories"><input name="allowedDataCategories" defaultValue={(json.applications?.[0]?.allowedDataCategories ?? ["business_general"]).join(", ")} className="input" disabled={readOnly} /></Field>
        <Field label="Blocked categories"><input name="blockedDataCategories" defaultValue={(json.applications?.[0]?.blockedDataCategories ?? ["government_id", "bank_account", "payment_card", "api_key", "password", "token", "private_key"]).join(", ")} className="input" disabled={readOnly} /></Field>
        <Select label="High risk action" name="high" defaultValue={json.riskActions?.high ?? "block"} options={["allow", "warn", "block"]} />
        <Select label="Critical risk action" name="critical" defaultValue={json.riskActions?.critical ?? "block"} options={["warn", "block"]} />
        <input type="hidden" name="low" value={json.riskActions?.low ?? "allow"} />
        <input type="hidden" name="medium" value={json.riskActions?.medium ?? "warn"} />
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"><input name="fileScanningEnabled" type="checkbox" defaultChecked={json.fileScanning?.enabled !== false} disabled={readOnly} /> File scanning enabled</label>
        <Field label="Max file size to scan MB"><input name="maxFileSizeToScanMB" type="number" defaultValue={json.fileScanning?.maxFileSizeToScanMB ?? 25} className="input" disabled={readOnly} /></Field>
        <Field label="Supported file types"><input name="supportedTypes" defaultValue={(json.fileScanning?.supportedTypes ?? ["pdf", "docx", "xlsx", "csv", "txt", "json", "xml", "png", "jpg"]).join(", ")} className="input" disabled={readOnly} /></Field>
        <Select label="Unsupported file type action" name="onUnsupportedFileType" defaultValue={json.fileScanning?.onUnsupportedFileType ?? "warn"} options={["allow", "warn", "block"]} />
        <Select label="File too large action" name="onFileTooLarge" defaultValue={json.fileScanning?.onFileTooLarge ?? "block"} options={["allow", "warn", "block"]} />
        <Select label="Scan failure action" name="onScanFailure" defaultValue={json.fileScanning?.onScanFailure ?? "block"} options={["allow", "warn", "block"]} />
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"><input name="ocrEnabled" type="checkbox" defaultChecked={Boolean(json.fileScanning?.ocrEnabled)} disabled={readOnly} /> OCR enabled</label>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"><input name="userOverrideEnabled" type="checkbox" defaultChecked={Boolean(json.userOverride?.enabled)} disabled={readOnly} /> User override enabled</label>
        <Field label="Override risk levels"><input name="allowForRiskLevels" defaultValue={(json.userOverride?.allowForRiskLevels ?? ["low", "medium"]).join(", ")} className="input" disabled={readOnly} /></Field>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"><input name="requireJustification" type="checkbox" defaultChecked={json.userOverride?.requireJustification !== false} disabled={readOnly} /> Require justification</label>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"><input name="educationEnabled" type="checkbox" defaultChecked={json.education?.enabled !== false} disabled={readOnly} /> Education triggers enabled</label>
        <Field label="Trigger after N risky events"><input name="triggerAfterRiskEvents" type="number" defaultValue={json.education?.triggerAfterRiskEvents ?? 3} className="input" disabled={readOnly} /></Field>
        <Field label="Lookback days"><input name="lookbackDays" type="number" defaultValue={json.education?.lookbackDays ?? 7} className="input" disabled={readOnly} /></Field>
        <Field label="Custom sensitive terms"><textarea name="customSensitiveTerms" defaultValue={(json.customSensitiveTerms ?? []).join("\n")} className="input min-h-28" placeholder="confidential&#10;internal only&#10;production token" disabled={readOnly} /></Field>
        <div className="xl:col-span-2 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950">
          <p>Raw prompt collection: <strong>Disabled</strong></p>
          <p>Raw file collection: <strong>Disabled</strong></p>
          <p>PII value storage: <strong>Disabled</strong></p>
        </div>
        <Field label="After publishing">
          <select name="publishApplyTarget" defaultValue="organization" className="input">
            <option value="organization">Apply to entire organization/customer</option>
            <option value="later">Apply later</option>
          </select>
        </Field>
        <div className="flex gap-3 xl:col-span-2">
          <button name="publish" value="false" className="rounded-md bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={readOnly}>Save Draft</button>
          <button name="publish" value="true" className="rounded-md bg-guard-teal px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={readOnly}>{policy?.status === "published" ? "Publish New Version" : "Publish"}</button>
          <button type="button" onClick={() => navigate("/policies")} className="enterprise-button">Cancel</button>
        </div>
      </form>
    </Page>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">{label}<div className="mt-1">{children}</div></label>; }
function Select({ label, name, options, defaultValue }: { label: string; name: string; options: string[]; defaultValue?: string }) { return <Field label={label}><select name={name} defaultValue={defaultValue} className="input">{options.map((option) => <option key={option}>{option}</option>)}</select></Field>; }
