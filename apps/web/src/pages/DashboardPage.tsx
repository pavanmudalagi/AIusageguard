import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, Bot, CheckCircle2, Download, FileWarning, Lock, MonitorCheck, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client";
import { Badge } from "../components/Badge";
import { DarkChartTooltip, chartAxisStyle, chartGridStyle } from "../components/DarkChartTooltip";
import type { EndpointAiUsageRow, OverviewMetrics } from "../types";
import type { LucideIcon } from "lucide-react";

const colors = ["#0f766e", "#2563eb", "#b45309", "#be123c", "#64748b"];

export default function DashboardPage() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<OverviewMetrics | null>(null);
  const [summary, setSummary] = useState<any>({ topToolsByUsage: [], topToolsByRisk: [], usageByAppType: [], appsByApprovalStatus: [], usageTrend: [] });
  const [rows, setRows] = useState<EndpointAiUsageRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0 });
  const [filters, setFilters] = useState({ search: "", appType: "", policyMode: "", policyStatus: "", riskLevel: "", sortBy: "lastUsedAt", sortDir: "desc" });
  const [assignRow, setAssignRow] = useState<EndpointAiUsageRow | null>(null);

  useEffect(() => {
    Promise.all([api.get("/dashboard/overview"), api.get("/dashboard/ai-tools-summary")]).then(([overviewRes, summaryRes]) => {
      setOverview(overviewRes.data);
      setSummary(summaryRes.data);
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(Object.entries({ ...filters, page: String(pagination.page), pageSize: String(pagination.pageSize) }).filter(([, value]) => value));
    api.get(`/dashboard/endpoint-ai-usage?${params}`).then((res) => {
      setRows(res.data.items);
      setPagination(res.data.pagination);
    });
  }, [filters, pagination.page, pagination.pageSize]);

  const cards: Array<[string, string | number, LucideIcon, string]> = overview ? [
    ["AI Tools Used", overview.aiToolsUsed, Bot, "Unique GenAI apps observed"],
    ["Total GenAI Apps Detected", overview.totalGenAIAppsDetected ?? 0, Bot, "Plugin app detections"],
    ["Protected Endpoints", overview.protectedEndpoints, MonitorCheck, "Plugin or agent active"],
    ["Sensitive Prompt Attempts", overview.sensitivePromptAttempts, ShieldAlert, "Prompt PII attempts"],
    ["Sensitive File Upload Attempts", overview.sensitiveFileUploadAttempts, FileWarning, "Risky file uploads"],
    ["Blocked Events", overview.blockedEvents, Lock, "Stopped by policy"],
    ["Warned Events", overview.warnedEvents, AlertTriangle, "User warning shown"],
    ["High/Critical Risk Events", overview.highCriticalRiskEvents, ShieldCheck, "Elevated risk attempts"],
    ["Policy Coverage", `${overview.policyCoveragePercent}%`, CheckCircle2, "Endpoints applied"],
    ["Prompts Scanned", overview.totalPromptsScanned ?? 0, ShieldCheck, "Plugin prompt scans"],
    ["Safe Prompt Replacements", overview.safePromptReplacements ?? 0, ShieldCheck, "Sanitized prompt replacements"],
    ["Files Scanned", overview.filesScanned ?? 0, FileWarning, "Plugin file scans"],
    ["Unknown AI Apps Detected", overview.unknownAIAppsDetected ?? 0, AlertTriangle, "Unrecognized tools"],
    ["Queued Events Pending Sync", overview.pendingQueuedEvents ?? 0, MonitorCheck, "Offline client queue"]
  ] : [];

  const csv = useMemo(() => rows.map((row) => ({
    machineName: row.machineName,
    userDisplay: row.userDisplay,
    operatingSystem: row.operatingSystem,
    genAIApplicationName: row.genAIApplicationName,
    appType: row.appType,
    usageCount: row.usageCount,
    piiAttemptCount: row.piiAttemptCount,
    sensitiveFileUploadCount: row.sensitiveFileUploadCount,
    lastUsedAt: row.lastUsedAt,
    currentPolicyName: row.currentPolicyName,
    policyMode: row.policyMode,
    policyStatus: row.policyStatus
  })), [rows]);

  function exportCsv() {
    const headers = Object.keys(csv[0] ?? { machineName: "", genAIApplicationName: "" });
    const lines = [headers.join(","), ...csv.map((row) => headers.map((header) => JSON.stringify(row[header as keyof typeof row] ?? "")).join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "endpoint-ai-usage-metadata.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-teal-700 dark:text-teal-300">Enterprise AI Governance</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">AI Usage & Risk Overview</h1>
          <p className="mt-2 text-sm text-slate-500">Metadata-only visibility across endpoints, users, AI tools, policy coverage, and sensitive data attempts.</p>
        </div>
        <button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm dark:bg-teal-600"><Download className="h-4 w-4" /> Export CSV</button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, Icon, hint]) => <div className="card p-5" key={String(label)}>
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-sm font-medium text-slate-500">{String(label)}</p><p className="mt-2 text-3xl font-bold">{String(value)}</p><p className="mt-1 text-xs text-slate-500">{String(hint)}</p></div>
            <div className="rounded-lg bg-teal-50 p-2 text-teal-700 dark:bg-teal-950 dark:text-teal-200"><Icon className="h-5 w-5" /></div>
          </div>
        </div>)}
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold">AI Tools Used in This Organization</h2>
          <p className="text-sm text-slate-500">Total unique AI tools used: <strong>{summary.uniqueToolsCount ?? 0}</strong></p>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <Chart title="AI Tools by Usage"><BarChart data={summary.topToolsByUsage}><CartesianGrid strokeDasharray="3 3" {...chartGridStyle} /><XAxis dataKey="appName" {...chartAxisStyle} /><YAxis {...chartAxisStyle} /><Tooltip content={<DarkChartTooltip />} cursor={{ fill: "rgba(20, 184, 166, 0.08)" }} /><Bar dataKey="usageCount" fill="#0f766e" radius={[6, 6, 0, 0]} /></BarChart></Chart>
          <Chart title="Approval Status"><PieChart><Pie data={summary.appsByApprovalStatus} dataKey="count" nameKey="status" innerRadius={58} outerRadius={95}>{summary.appsByApprovalStatus.map((_: any, index: number) => <Cell key={index} fill={colors[index % colors.length]} />)}</Pie><Tooltip content={<DarkChartTooltip />} /></PieChart></Chart>
          <Chart title="AI Usage Trend"><LineChart data={summary.usageTrend}><CartesianGrid strokeDasharray="3 3" {...chartGridStyle} /><XAxis dataKey="day" {...chartAxisStyle} /><YAxis {...chartAxisStyle} /><Tooltip content={<DarkChartTooltip />} /><Line type="monotone" dataKey="count" stroke="#38bdf8" strokeWidth={2.5} dot={{ r: 3, fill: "#38bdf8" }} activeDot={{ r: 5 }} /></LineChart></Chart>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Chart title="Top Risky AI Tools"><BarChart data={summary.topToolsByRisk}><CartesianGrid strokeDasharray="3 3" {...chartGridStyle} /><XAxis dataKey="appName" {...chartAxisStyle} /><YAxis {...chartAxisStyle} /><Tooltip content={<DarkChartTooltip />} cursor={{ fill: "rgba(244, 63, 94, 0.08)" }} /><Bar dataKey="riskEventCount" fill="#e11d48" radius={[6, 6, 0, 0]} /></BarChart></Chart>
          <Chart title="Browser vs Desktop Split"><BarChart data={summary.usageByAppType}><CartesianGrid strokeDasharray="3 3" {...chartGridStyle} /><XAxis dataKey="appType" {...chartAxisStyle} /><YAxis {...chartAxisStyle} /><Tooltip content={<DarkChartTooltip />} cursor={{ fill: "rgba(245, 158, 11, 0.08)" }} /><Bar dataKey="count" fill="#f59e0b" radius={[6, 6, 0, 0]} /></BarChart></Chart>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 p-5 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-xl font-bold">Endpoint AI Usage & Policy Status</h2><p className="text-sm text-slate-500">One row per machine and AI tool combination. Metadata only.</p></div>
            <div className="flex flex-wrap gap-2">
              <div className="enterprise-filter"><Search className="h-4 w-4 text-slate-400" /><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} className="bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500" placeholder="Machine, user, AI app" /></div>
              <Select value={filters.appType} onChange={(appType) => setFilters({ ...filters, appType })} options={["", "browser", "desktop", "browser_and_desktop"]} label="App type" />
              <Select value={filters.policyMode} onChange={(policyMode) => setFilters({ ...filters, policyMode })} options={["", "monitor", "passive", "active"]} label="Mode" />
              <Select value={filters.policyStatus} onChange={(policyStatus) => setFilters({ ...filters, policyStatus })} options={["", "applied", "pending", "failed", "out_of_date"]} label="Status" />
              <Select value={filters.riskLevel} onChange={(riskLevel) => setFilters({ ...filters, riskLevel })} options={["", "low", "medium", "high", "critical"]} label="Risk" />
              <Select value={filters.sortBy} onChange={(sortBy) => setFilters({ ...filters, sortBy })} options={["usageCount", "piiAttemptCount", "sensitiveFileUploadCount", "lastUsedAt"]} label="Sort" />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] text-sm">
            <thead className="table-head"><tr>{["Machine Name", "User", "Operating System", "AI Tool Used", "App Type", "Usage Count", "PII Attempt Count", "Sensitive File Upload Count", "Last Used", "Current Policy", "Policy Mode", "Policy Status", "Action"].map((header) => <th key={header} className="p-3">{header}</th>)}</tr></thead>
            <tbody>
              {rows.map((row) => <tr key={`${row.endpointId}-${row.genAIApplicationId ?? row.genAIApplicationName}`} className="border-t border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/70">
                <td className="p-3 font-semibold"><Link className="text-teal-700 hover:underline dark:text-teal-300" to={`/endpoints/${row.endpointId}`}>{row.machineName}</Link></td>
                <td className="p-3">{row.userDisplay}</td>
                <td className="p-3">{row.operatingSystem}</td>
                <td className="p-3 font-medium">{row.genAIApplicationId ? <Link className="text-blue-700 hover:underline dark:text-blue-300" to={`/genai-apps/${row.genAIApplicationId}`}>{row.genAIApplicationName}</Link> : row.genAIApplicationName}</td>
                <td className="p-3"><Badge value={row.appType} /></td>
                <td className="p-3 font-semibold">{row.usageCount}</td>
                <td className="p-3"><button onClick={() => navigate(`/risk-events?endpointId=${row.endpointId}&genAIApplicationId=${row.genAIApplicationId ?? ""}`)} className="font-semibold text-rose-700 hover:underline dark:text-rose-300">{row.piiAttemptCount}</button></td>
                <td className="p-3 font-semibold">{row.sensitiveFileUploadCount}</td>
                <td className="p-3">{new Date(row.lastUsedAt).toLocaleString()}</td>
                <td className="p-3">{row.currentPolicyId ? <Link className="text-blue-700 hover:underline dark:text-blue-300" to={`/policies/${row.currentPolicyId}/edit`}>{row.currentPolicyName}</Link> : "Unassigned"}</td>
                <td className="p-3"><Badge value={row.policyMode} /></td>
                <td className="p-3"><Badge value={row.policyStatus} /></td>
                <td className="space-x-2 p-3"><button onClick={() => navigate(`/endpoints/${row.endpointId}`)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900">View Details</button><button onClick={() => row.currentPolicyId && navigate(`/policies/${row.currentPolicyId}/edit?endpointId=${row.endpointId}&app=${encodeURIComponent(row.genAIApplicationName)}`)} className="rounded-md bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500">Edit Policy</button><button onClick={() => setAssignRow(row)} className="rounded-md bg-teal-600 px-2 py-1 text-xs text-white hover:bg-teal-500">Assign Policy</button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 p-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300"><span>{pagination.total} rows</span><div className="space-x-2"><button disabled={pagination.page <= 1} onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })} className="enterprise-button px-3 py-1">Previous</button><button disabled={pagination.page * pagination.pageSize >= pagination.total} onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })} className="enterprise-button px-3 py-1">Next</button></div></div>
      </section>
      {assignRow && <AssignPolicyModal row={assignRow} onClose={() => setAssignRow(null)} />}
    </div>
  );
}

function Select({ value, onChange, options, label }: { value: string; onChange: (value: string) => void; options: string[]; label: string }) {
  return <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="enterprise-select">{options.map((option) => <option key={option} value={option}>{option || label}</option>)}</select>;
}

function Chart({ title, children }: { title: string; children: JSX.Element }) {
  return <div className="card p-5"><h3 className="mb-4 font-semibold">{title}</h3><div className="h-72"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div></div>;
}

function AssignPolicyModal({ row, onClose }: { row: EndpointAiUsageRow; onClose: () => void }) {
  const [policies, setPolicies] = useState<any[]>([]);
  const [policyId, setPolicyId] = useState("");
  const [scope, setScope] = useState("endpoint");
  useEffect(() => { api.get("/policies").then((res) => { const items = res.data.items.filter((item: any) => item.status === "published"); setPolicies(items); setPolicyId(items[0]?.id ?? ""); }); }, []);
  async function assign() {
    const policy = policies.find((item) => item.id === policyId);
    if (!policy) return;
    await api.post(`/policies/${policyId}/assign`, { organizationId: policy.organizationId, assignmentType: scope === "endpoint" ? "endpoint" : "organization", assignmentTargetId: scope === "endpoint" ? row.endpointId : null, priority: 5 });
    onClose();
  }
  return <div className="enterprise-modal-backdrop"><div className="card w-full max-w-lg p-5"><h2 className="text-lg font-bold">Assign Policy</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{row.machineName} · {row.genAIApplicationName}</p><label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-200">Published policy<select className="input mt-1" value={policyId} onChange={(event) => setPolicyId(event.target.value)}>{policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.name}</option>)}</select></label><label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-200">Assignment scope<select className="input mt-1" value={scope} onChange={(event) => setScope(event.target.value)}><option value="endpoint">This endpoint only</option><option value="endpoint_user">This endpoint + current user</option><option value="organization">All endpoints in this organization</option><option value="app">All endpoints using this AI tool</option></select></label><div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="enterprise-button">Cancel</button><button onClick={assign} className="rounded-md bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-500">Save assignment</button></div></div></div>;
}
