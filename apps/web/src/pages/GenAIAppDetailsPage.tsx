import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { Badge } from "../components/Badge";
import { Page, Table } from "./EndpointsPage";

export default function GenAIAppDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const load = () => api.get(`/genai-apps/${id}`).then((res) => setData(res.data));
  useEffect(() => { load(); }, [id]);
  if (!data) return <Page title="AI Tool Details" subtitle="Loading AI application metadata..."><div className="card p-5">Loading</div></Page>;
  const app = data.item;
  async function setStatus(approvedStatus: string) {
    await api.put(`/genai-apps/${app.id}/status`, { approvedStatus });
    load();
  }
  return <Page title={app.name} subtitle="AI application posture, usage, risk, approval status, and policy actions.">
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <Metric label="Type" value={<Badge value={app.appType} />} />
      <Metric label="Domain / executable" value={app.domain ?? app.executableName ?? "-"} />
      <Metric label="Approved status" value={<Badge value={app.approvedStatus} />} />
      <Metric label="Endpoints / users" value={`${data.metrics.endpointCount} / ${data.metrics.userCount}`} />
      <Metric label="Usage / PII / files" value={`${data.metrics.usageCount} / ${data.metrics.piiAttemptCount} / ${data.metrics.fileUploadAttemptCount}`} />
      <Metric label="Total detections" value={data.metrics.totalDetections ?? 0} />
      <Metric label="Prompt scans / sensitive" value={`${data.metrics.promptScanCount ?? 0} / ${data.metrics.sensitivePromptCount ?? 0}`} />
      <Metric label="File scans / sensitive" value={`${data.metrics.fileScanCount ?? 0} / ${data.metrics.sensitiveFileCount ?? 0}`} />
      <Metric label="Blocked / warned" value={`${data.metrics.blockedCount ?? 0} / ${data.metrics.warnedCount ?? 0}`} />
    </div>
    <div className="card flex flex-wrap gap-2 p-4"><button onClick={() => setStatus("approved")} className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white">Approved</button><button onClick={() => setStatus("restricted")} className="rounded-md bg-amber-600 px-3 py-2 text-sm text-white">Restricted</button><button onClick={() => setStatus("blocked")} className="rounded-md bg-rose-600 px-3 py-2 text-sm text-white">Blocked</button><button onClick={() => setStatus("unknown")} className="rounded-md bg-slate-700 px-3 py-2 text-sm text-white">Unknown</button><button onClick={() => navigate(`/policies/new?app=${encodeURIComponent(app.name)}`)} className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white">Create app-specific policy</button></div>
    <Table headers={["Timestamp", "Endpoint", "User", "Input", "Risk", "Categories", "Action"]}>
      {data.recentEvents.map((event: any) => <tr key={event.id} className="border-t border-slate-200 dark:border-slate-800"><td className="p-3">{new Date(event.createdAt).toLocaleString()}</td><td className="p-3">{event.endpoint.hostname}</td><td className="p-3">{event.endpointUser?.displayName ?? event.endpointUser?.userIdentifierHash ?? "-"}</td><td className="p-3">{event.inputType}</td><td className="p-3"><Badge value={event.riskLevel} /></td><td className="p-3">{event.detectedCategories.join(", ") || "-"}</td><td className="p-3"><Badge value={event.actionTaken} /></td></tr>)}
    </Table>
  </Page>;
}

function Metric({ label, value }: { label: string; value: any }) { return <div className="card p-4"><p className="text-sm text-slate-500">{label}</p><div className="mt-2 font-semibold">{value}</div></div>; }
