import { useEffect, useMemo, useState } from "react";
import { Copy, DownloadCloud, FileDown, KeyRound, Loader2, PackageCheck, Rocket, ShieldAlert, UploadCloud } from "lucide-react";
import { api } from "../api/client";
import { Badge } from "../components/Badge";
import { Page, Table } from "./EndpointsPage";

type Organization = { id: string; name: string; type: "msp" | "customer"; parentOrgId?: string | null };
type Policy = { id: string; name: string; version: string; status: string; mode?: string; organizationId: string };

const emptyVersion = { version: "", targetBrowser: "chrome", releaseNotes: "", minimumSupportedVersion: "", severity: "recommended", status: "published", rolloutRing: "full" };

export default function BrowserPluginPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState("");
  const [versions, setVersions] = useState<any[]>([]);
  const [status, setStatus] = useState<any>({});
  const [installs, setInstalls] = useState<any[]>([]);
  const [versionForm, setVersionForm] = useState(emptyVersion);
  const [rolloutRing, setRolloutRing] = useState("pilot");
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [token, setToken] = useState("");
  const [tokenExpiry, setTokenExpiry] = useState("");
  const [serverUrl, setServerUrl] = useState("http://localhost:4000");
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [targetBrowser, setTargetBrowser] = useState("chrome");
  const [packageType, setPackageType] = useState("managed_deployment");

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    setSelectedPolicyId("");
    setPolicies([]);
    setToken("");
    setTokenExpiry("");
    if (!selectedOrganizationId) return;
    api.get(`/policies?organizationId=${encodeURIComponent(selectedOrganizationId)}&status=published`)
      .then((res) => {
        const loaded = res.data.items ?? [];
        setPolicies(loaded);
        if (loaded.length === 1) setSelectedPolicyId(loaded[0].id);
      })
      .catch(() => setErrorMessage("Unable to load published policies for the selected organization."));
  }, [selectedOrganizationId]);

  async function refresh() {
    setIsLoading(true);
    try {
      const [orgRes, versionRes, statusRes, installRes] = await Promise.all([
        api.get("/orgs"),
        api.get("/browser-plugin/versions"),
        api.get("/browser-plugin/deployment-status"),
        api.get("/browser-plugin/installs")
      ]);
      const loadedOrgs = orgRes.data.items ?? [];
      setOrganizations(loadedOrgs);
      if (!selectedOrganizationId && loadedOrgs.length === 1) setSelectedOrganizationId(loadedOrgs[0].id);
      setVersions(versionRes.data.items ?? []);
      setStatus(statusRes.data ?? {});
      setInstalls(installRes.data.items ?? statusRes.data?.installs ?? []);
    } catch {
      setErrorMessage("Unable to load browser plugin update data. Confirm the API server is running.");
    } finally {
      setIsLoading(false);
    }
  }

  const selectedOrganization = organizations.find((org) => org.id === selectedOrganizationId);
  const selectedPolicy = policies.find((policy) => policy.id === selectedPolicyId);
  const latestVersion = versions.find((version) => version.isLatest || version.status === "latest") ?? versions[0];
  const outdatedInstalls = installs.filter((install) => ["update_available", "update_required", "pending_admin_deployment"].includes(install.updateStatus));
  const packageValidationMessage = useMemo(() => {
    if (!selectedOrganizationId) return "Select an organization/customer before downloading the package.";
    if (!selectedPolicyId) return "Select a default policy before downloading the package.";
    if (!serverUrl.trim()) return "Enter the server URL before downloading the package.";
    if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 90) return "Enrollment token expiry must be between 1 and 90 days.";
    return "";
  }, [selectedOrganizationId, selectedPolicyId, serverUrl, expiresInDays]);

  async function registerVersion() {
    setErrorMessage("");
    setMessage("");
    if (!versionForm.version.trim() || !versionForm.releaseNotes.trim()) return setErrorMessage("Version and release notes are required.");
    setIsRegistering(true);
    try {
      await api.post("/browser-plugin/versions", { ...versionForm, minimumSupportedVersion: versionForm.minimumSupportedVersion || null });
      setVersionForm(emptyVersion);
      setMessage("Plugin version registered.");
      await refresh();
    } catch {
      setErrorMessage("Unable to register plugin version.");
    } finally {
      setIsRegistering(false);
    }
  }

  async function versionAction(id: string, action: "mark-latest" | "mark-required" | "deprecate") {
    setErrorMessage("");
    setMessage("");
    try {
      await api.post(`/browser-plugin/versions/${id}/${action}`);
      setMessage(action === "mark-latest" ? "Version marked latest." : action === "mark-required" ? "Version marked required." : "Version deprecated.");
      await refresh();
    } catch {
      setErrorMessage("Unable to update plugin version.");
    }
  }

  async function createRollout() {
    setErrorMessage("");
    setMessage("");
    if (!selectedOrganizationId || !latestVersion) return setErrorMessage("Select an organization and register a latest version first.");
    try {
      await api.post("/browser-plugin/rollouts", {
        organizationId: selectedOrganizationId,
        pluginVersionId: latestVersion.id,
        rolloutName: `${latestVersion.version} ${rolloutRing} rollout`,
        rolloutRing,
        targetType: "organization",
        targetId: selectedOrganizationId,
        status: "active"
      });
      setMessage("Plugin rollout started.");
      await refresh();
    } catch {
      setErrorMessage("Unable to start plugin rollout.");
    }
  }

  async function generateToken() {
    setErrorMessage("");
    setMessage("");
    if (!selectedOrganizationId || !selectedPolicyId) return setErrorMessage("Select an organization and published policy first.");
    setIsGeneratingToken(true);
    try {
      const res = await api.post("/browser-plugin/enrollment-token", { organizationId: selectedOrganizationId, policyId: selectedPolicyId, expiresInDays: Number(expiresInDays), targetBrowser });
      setToken(res.data.enrollmentToken);
      setTokenExpiry(res.data.expiresAt);
      setMessage("Enrollment token generated.");
    } catch {
      setErrorMessage("Unable to generate enrollment token.");
    } finally {
      setIsGeneratingToken(false);
    }
  }

  async function downloadPackage(managed = false) {
    setErrorMessage("");
    setMessage("");
    if (packageValidationMessage) return setErrorMessage(packageValidationMessage);
    setIsDownloading(true);
    try {
      const res = await api.post("/browser-plugin/package", { organizationId: selectedOrganizationId, policyId: selectedPolicyId, serverUrl, targetBrowser, packageType: managed ? "managed_deployment" : packageType, enrollmentTokenExpiresInDays: Number(expiresInDays) }, { responseType: "blob" });
      downloadBlob(res.data, `ai-usage-guard-browser-shield-${slug(selectedOrganization?.name)}-${slug(selectedPolicy?.name)}.zip`);
      setMessage(managed ? "Managed deployment package downloaded." : "Browser Shield package downloaded.");
    } catch {
      setErrorMessage("Unable to download browser plugin package.");
    } finally {
      setIsDownloading(false);
    }
  }

  async function downloadLatestPackage() {
    if (!latestVersion) return setErrorMessage("Register a latest plugin version first.");
    const res = await api.get(`/browser-plugin/download/${encodeURIComponent(latestVersion.version)}`, { responseType: "blob" });
    downloadBlob(res.data, `ai-usage-guard-browser-shield-${latestVersion.version}.zip`);
  }

  function exportOutdated() {
    const csv = ["Machine,Organization,Browser,Current Version,Latest Version,Update Status,Last Check-in"].concat(outdatedInstalls.map((item) => [
      item.machineName,
      item.organization?.name ?? item.organizationId,
      item.browser,
      item.pluginVersion,
      item.latestAvailableVersion ?? status.latestVersion ?? "",
      item.updateStatus,
      item.lastSeenAt ?? ""
    ].map(csvValue).join(","))).join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv" }), "outdated-browser-plugins.csv");
  }

  return <Page title="Browser Plugin Updates" subtitle="Track Browser Shield versions, policy sync, and deployment-managed extension updates.">
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-8">
      <Metric label="Latest plugin version" value={status.latestVersion ?? "0.7.1"} />
      <Metric label="Minimum required" value={status.minimumRequiredVersion ?? "-"} />
      <Metric label="Installed plugins" value={status.totalInstalls ?? 0} />
      <Metric label="Up to date" value={status.upToDatePlugins ?? 0} />
      <Metric label="Outdated" value={status.outdatedPlugins ?? 0} />
      <Metric label="Update required" value={status.updateRequired ?? 0} />
      <Metric label="Rollout progress" value={`${status.updateRolloutProgress ?? 0}%`} />
      <Metric label="Policy sync success" value={`${status.policySyncSuccessRate ?? 0}%`} />
    </div>

    <section className="card mt-5 p-5">
      <div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 text-amber-600" /><p className="text-sm text-slate-600 dark:text-slate-300">Plugin code updates must be deployed through Chrome Web Store, Chrome Enterprise policy, RMM, MDM, or approved enterprise extension update mechanisms. The dashboard can manage policy updates over the air and track plugin version rollout, but the plugin does not execute remote code.</p></div>
    </section>

    {(message || errorMessage) && <p className={`mt-5 rounded-md border p-3 text-sm ${errorMessage ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"}`}>{errorMessage || message}</p>}

    <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_1.2fr]">
      <div className="card p-5">
        <div className="flex items-center gap-2"><UploadCloud className="h-5 w-5 text-teal-600" /><h2 className="font-bold">Register Plugin Version</h2></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Version"><input className="input" value={versionForm.version} onChange={(event) => setVersionForm({ ...versionForm, version: event.target.value })} placeholder="0.9.0" /></Field>
          <Select label="Target browser" value={versionForm.targetBrowser} onChange={(value) => setVersionForm({ ...versionForm, targetBrowser: value })} options={[["chrome", "Chrome"], ["edge", "Edge"]]} />
          <Field label="Minimum supported"><input className="input" value={versionForm.minimumSupportedVersion} onChange={(event) => setVersionForm({ ...versionForm, minimumSupportedVersion: event.target.value })} placeholder="0.8.0" /></Field>
          <Select label="Severity" value={versionForm.severity} onChange={(value) => setVersionForm({ ...versionForm, severity: value })} options={[["optional", "Optional"], ["recommended", "Recommended"], ["required", "Required"]]} />
          <Select label="Status" value={versionForm.status} onChange={(value) => setVersionForm({ ...versionForm, status: value })} options={[["draft", "Draft"], ["published", "Published"], ["latest", "Latest"]]} />
          <Select label="Rollout ring" value={versionForm.rolloutRing} onChange={(value) => setVersionForm({ ...versionForm, rolloutRing: value })} options={[["pilot", "Pilot"], ["staged", "Staged"], ["full", "Full"]]} />
          <label className="block text-sm font-medium sm:col-span-2">Release notes<textarea className="input mt-1 min-h-24" value={versionForm.releaseNotes} onChange={(event) => setVersionForm({ ...versionForm, releaseNotes: event.target.value })} /></label>
        </div>
        <button onClick={registerVersion} disabled={isRegistering} className="mt-4 inline-flex items-center gap-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400">{isRegistering ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />} Register version</button>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2"><DownloadCloud className="h-5 w-5 text-teal-600" /><h2 className="font-bold">Deployment Package</h2></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Organization/customer"><select className="input" value={selectedOrganizationId} onChange={(event) => setSelectedOrganizationId(event.target.value)}><option value="">{isLoading ? "Loading..." : "Select organization/customer"}</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name} - {org.type}</option>)}</select></Field>
          <Field label="Default policy"><select className="input" value={selectedPolicyId} disabled={!selectedOrganizationId || policies.length === 0} onChange={(event) => setSelectedPolicyId(event.target.value)}><option value="">Select default policy</option>{policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.name} - v{policy.version}</option>)}</select></Field>
          <Field label="Server URL"><input className="input" value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} /></Field>
          <Field label="Token expiry days"><input className="input" type="number" min={1} max={90} value={expiresInDays} onChange={(event) => setExpiresInDays(Number(event.target.value))} /></Field>
          <Select label="Target browser" value={targetBrowser} onChange={setTargetBrowser} options={[["chrome", "Chrome"], ["edge", "Edge"]]} />
          <Select label="Package type" value={packageType} onChange={setPackageType} options={[["unpacked_zip", "Unpacked ZIP"], ["managed_deployment", "Managed deployment"], ["policy_json_only", "Policy JSON only"]]} />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button disabled={isDownloading} onClick={() => downloadPackage(false)} className="inline-flex items-center gap-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400">{isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />} Download package</button>
          <button disabled={isDownloading} onClick={() => downloadPackage(true)} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700"><FileDown className="h-4 w-4" /> Create managed deployment package</button>
          <button onClick={downloadLatestPackage} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700"><DownloadCloud className="h-4 w-4" /> Download latest plugin package</button>
          <button disabled={!selectedOrganizationId || !selectedPolicyId || isGeneratingToken} onClick={generateToken} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700">{isGeneratingToken ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Generate token</button>
        </div>
        {token && <div className="mt-4 rounded-lg bg-slate-950 p-3 text-xs text-slate-100"><p className="mb-2 text-slate-400">Expires: {tokenExpiry ? new Date(tokenExpiry).toLocaleString() : "-"}</p><code className="break-all">{token}</code><button onClick={() => navigator.clipboard.writeText(token)} className="ml-3 inline-flex items-center gap-1 text-teal-200"><Copy className="h-3 w-3" /> Copy</button></div>}
      </div>
    </section>

    <section className="card mt-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-bold">Managed Rollout</h2><p className="text-sm text-slate-500">Start a rollout for the latest version to the selected organization.</p></div>
        <div className="flex items-center gap-2">
          <Select label="Rollout ring" value={rolloutRing} onChange={setRolloutRing} options={[["pilot", "Pilot"], ["staged", "Staged"], ["full", "Full"]]} />
          <button onClick={createRollout} className="mt-6 inline-flex items-center gap-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white"><Rocket className="h-4 w-4" /> Start rollout</button>
          <button onClick={exportOutdated} className="mt-6 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700">Export outdated</button>
        </div>
      </div>
    </section>

    <section className="mt-5"><h2 className="mb-3 text-lg font-bold">Plugin Versions</h2><Table headers={["Version", "Status", "Release date", "Minimum supported", "Severity", "Ring", "Checksum", "Download", "Actions"]}>{versions.map((version) => <tr key={version.id} className="border-t border-slate-200 dark:border-slate-800"><td className="p-3 font-semibold">{version.version}</td><td className="p-3"><Badge value={version.status ?? (version.isLatest ? "latest" : "published")} /></td><td className="p-3">{version.publishedAt ? new Date(version.publishedAt).toLocaleDateString() : "-"}</td><td className="p-3">{version.minimumSupportedVersion ?? "-"}</td><td className="p-3"><Badge value={version.severity ?? "recommended"} /></td><td className="p-3">{version.rolloutRing ?? "full"}</td><td className="max-w-40 truncate p-3">{version.checksum ?? "-"}</td><td className="p-3"><button onClick={() => api.get(`/browser-plugin/download/${encodeURIComponent(version.version)}`, { responseType: "blob" }).then((res) => downloadBlob(res.data, `ai-usage-guard-browser-shield-${version.version}.zip`))} className="text-teal-700 dark:text-teal-300">Download</button></td><td className="p-3"><div className="flex flex-wrap gap-2"><button onClick={() => versionAction(version.id, "mark-latest")} className="text-teal-700 dark:text-teal-300">Latest</button><button onClick={() => versionAction(version.id, "mark-required")} className="text-amber-700 dark:text-amber-300">Required</button><button onClick={() => versionAction(version.id, "deprecate")} className="text-rose-700 dark:text-rose-300">Deprecate</button></div></td></tr>)}</Table></section>

    <section className="mt-5"><h2 className="mb-3 text-lg font-bold">Endpoint Plugin Status</h2><Table headers={["Machine", "Organization", "Browser", "Current version", "Latest version", "Update status", "Last check-in", "Current policy", "Policy status", "Action"]}>{installs.map((install) => <tr key={install.id} className="border-t border-slate-200 dark:border-slate-800"><td className="p-3 font-semibold">{install.machineName}</td><td className="p-3">{install.organization?.name ?? install.organizationId}</td><td className="p-3">{install.browser} {install.browserVersion}</td><td className="p-3">{install.pluginVersion}</td><td className="p-3">{install.latestAvailableVersion ?? status.latestVersion ?? "-"}</td><td className="p-3"><Badge value={install.updateStatus ?? install.installStatus ?? "unknown"} /></td><td className="p-3">{install.lastSeenAt ? new Date(install.lastSeenAt).toLocaleString() : "-"}</td><td className="p-3">{install.currentPolicyVersion ?? "-"}</td><td className="p-3"><Badge value={install.policyStatus} /></td><td className="p-3">{install.updateStatus === "up_to_date" ? "-" : "Admin deploy"}</td></tr>)}</Table></section>
  </Page>;
}

function Metric({ label, value }: { label: string; value: string | number }) { return <div className="card p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-medium">{label}<div className="mt-1">{children}</div></label>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) { return <Field label={label}><select className="input" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></Field>; }
function slug(value = "unknown") { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown"; }
function csvValue(value: unknown) { return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`; }
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
