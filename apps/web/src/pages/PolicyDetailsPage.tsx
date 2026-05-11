import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { Badge } from "../components/Badge";
import { Page, Table } from "./EndpointsPage";

export default function PolicyDetailsPage() {
  const { id } = useParams();
  const [item, setItem] = useState<any>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (id) api.get(`/policies/${id}`).then((res) => setItem(res.data.item));
  }, [id]);
  if (!item) return <Page title="Policy Details" subtitle="Loading policy..."><div className="card p-5">Loading</div></Page>;
  const json = item.policyJson ?? {};
  const deliverySummary = item.deliverySummary ?? {};
  async function retrySync() {
    if (!id) return;
    const res = await api.post(`/policies/${id}/retry-sync`);
    setMessage(`Retry queued for ${res.data.retriedEndpoints ?? 0} failed endpoint(s).`);
    const refreshed = await api.get(`/policies/${id}`);
    setItem(refreshed.data.item);
  }
  return <Page title={item.name} subtitle={`Policy version ${item.version}`}>
    <div className="mb-4 flex flex-wrap justify-end gap-3"><button onClick={retrySync} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700">Retry policy sync</button><Link to={`/policies/${item.id}/edit`} className="rounded-md bg-guard-teal px-4 py-2 text-sm font-semibold text-white">Edit policy</Link></div>
    {message && <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{message}</p>}
    <section className="grid gap-4 md:grid-cols-4 xl:grid-cols-8">
      <Metric label="Status" value={<Badge value={item.status} />} />
      <Metric label="Mode" value={json.mode} />
      <Metric label="Default action" value={json.defaultAction} />
      <Metric label="Unknown app" value={json.unknownGenAIAppAction} />
      <Metric label="Pending" value={deliverySummary.pending ?? 0} />
      <Metric label="Delivered" value={deliverySummary.delivered ?? 0} />
      <Metric label="Applied" value={deliverySummary.applied ?? 0} />
      <Metric label="Failed" value={deliverySummary.failed ?? 0} />
    </section>
    <section className="card mt-5 p-5">
      <h2 className="font-bold">Scanning Settings</h2>
      <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
        <p>Prompt scanning: <strong>{json.promptScanning?.enabled ? "Enabled" : "Disabled"}</strong></p>
        <p>PII detection: <strong>{json.piiDetection?.enabled !== false ? "Enabled" : "Disabled"}</strong></p>
        <p>Prompt PII action: {json.onPiiDetected?.promptAction ?? "block"}</p>
        <p>File PII action: {json.onPiiDetected?.fileUploadAction ?? "block"}</p>
        <p>Enabled categories: {(json.promptScanning?.enabledCategories ?? []).join(", ") || "-"}</p>
        <p>File scanning: <strong>{json.fileScanning?.enabled ? "Enabled" : "Disabled"}</strong></p>
        <p>Max file size: {json.fileScanning?.maxFileSizeToScanMB ?? "-"} MB</p>
        <p>Unsupported file: {json.fileScanning?.onUnsupportedFileType ?? "-"}</p>
        <p>Scan failure: {json.fileScanning?.onScanFailure ?? "-"}</p>
      </div>
    </section>
    <section className="card mt-5 p-5">
      <h2 className="font-bold">App-Specific Rules</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm"><thead className="table-head"><tr><th className="p-3">App</th><th className="p-3">Status</th><th className="p-3">Domains</th><th className="p-3">PII</th><th className="p-3">Files</th><th className="p-3">Blocked categories</th></tr></thead><tbody>{(json.applications ?? []).map((rule: any) => <tr key={rule.appName} className="border-t border-slate-200 dark:border-slate-800"><td className="p-3 font-semibold">{rule.appName}</td><td className="p-3"><Badge value={rule.appStatus ?? "unknown"} /></td><td className="p-3">{rule.domains?.join(", ") || "-"}</td><td className="p-3">{rule.piiHandling}</td><td className="p-3">{rule.fileUploadHandling}</td><td className="p-3">{rule.blockedDataCategories?.join(", ") || "-"}</td></tr>)}</tbody></table>
      </div>
    </section>
    <section className="mt-5 grid gap-4 xl:grid-cols-2">
      <div><h2 className="mb-3 text-lg font-bold">Assignments</h2><Table headers={["Type", "Target", "Priority", "Created"]}>{(item.assignments ?? []).map((assignment: any) => <tr key={assignment.id} className="border-t border-slate-200 dark:border-slate-800"><td className="p-3">{assignment.assignmentType}</td><td className="p-3">{assignment.assignmentTargetId ?? assignment.organizationId}</td><td className="p-3">{assignment.priority}</td><td className="p-3">{new Date(assignment.createdAt).toLocaleString()}</td></tr>)}</Table></div>
      <div><h2 className="mb-3 text-lg font-bold">Delivery Status</h2><Table headers={["Endpoint", "Status", "Delivered", "Applied", "Error"]}>{(item.deliveries ?? []).map((delivery: any) => <tr key={delivery.id} className="border-t border-slate-200 dark:border-slate-800"><td className="p-3">{delivery.endpoint?.hostname}</td><td className="p-3"><Badge value={delivery.deliveryStatus} /></td><td className="p-3">{delivery.deliveredAt ? new Date(delivery.deliveredAt).toLocaleString() : "-"}</td><td className="p-3">{delivery.appliedAt ? new Date(delivery.appliedAt).toLocaleString() : "-"}</td><td className="p-3">{delivery.errorMessage ?? "-"}</td></tr>)}</Table></div>
    </section>
    <section className="mt-5"><h2 className="mb-3 text-lg font-bold">Recent Enforcement Events</h2><Table headers={["Time", "Endpoint", "App", "Event", "Action", "Risk"]}>{(item.recentEvents ?? []).map((event: any) => <tr key={event.id} className="border-t border-slate-200 dark:border-slate-800"><td className="p-3">{new Date(event.createdAt).toLocaleString()}</td><td className="p-3">{event.endpoint?.hostname}</td><td className="p-3">{event.genAIApplicationName}</td><td className="p-3">{event.eventType}</td><td className="p-3"><Badge value={event.actionTaken} /></td><td className="p-3"><Badge value={event.riskLevel} /></td></tr>)}</Table></section>
  </Page>;
}

function Metric({ label, value }: { label: string; value: any }) {
  return <div className="card p-4"><p className="text-sm text-slate-500">{label}</p><div className="mt-2 font-semibold">{value}</div></div>;
}
