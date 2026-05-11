import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import { Badge } from "../components/Badge";
import { Page, Table } from "./EndpointsPage";

export default function EndpointDetailsPage() {
  const { id } = useParams();
  const [item, setItem] = useState<any>(null);
  useEffect(() => { api.get(`/endpoints/${id}`).then((res) => setItem(res.data.item)); }, [id]);
  if (!item) return <Page title="Endpoint Details" subtitle="Loading endpoint metadata..."><div className="card p-5">Loading</div></Page>;
  const pii = item.events.filter((event: any) => event.eventType === "sensitive_prompt_detected").length;
  const files = item.events.filter((event: any) => ["sensitive_file_detected", "sensitive_file_upload_detected", "file_upload_blocked", "file_upload_warned"].includes(event.eventType)).length;
  return <Page title={item.hostname} subtitle="Endpoint inventory, AI tool usage, risk events, and policy delivery history.">
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Metric label="Device ID" value={item.deviceId} />
      <Metric label="OS" value={`${item.os} ${item.osVersion ?? ""}`} />
      <Metric label="Last seen" value={item.lastSeenAt ? new Date(item.lastSeenAt).toLocaleString() : "-"} />
      <Metric label="Policy status" value={<Badge value={item.policyStatus} />} />
      <Metric label="Extension" value={item.browserExtensionVersion ?? "-"} />
      <Metric label="Agent" value={item.localAgentVersion ?? "-"} />
      <Metric label="Total GenAI usage" value={item.events.length} />
      <Metric label="PII / file attempts" value={`${pii} / ${files}`} />
    </div>
    <Table headers={["Timestamp", "AI Tool", "Input", "File type", "Risk", "Categories", "Counts", "Action", "Policy"]}>
      {item.events.map((event: any) => <tr key={event.id} className="border-t border-slate-200 dark:border-slate-800"><td className="p-3">{new Date(event.createdAt).toLocaleString()}</td><td className="p-3">{event.genAIApplicationName}</td><td className="p-3">{event.inputType}</td><td className="p-3">{event.fileType ?? "-"}</td><td className="p-3"><Badge value={event.riskLevel} /></td><td className="p-3">{event.detectedCategories.join(", ") || "-"}</td><td className="p-3">{JSON.stringify(event.detectedCategoryCounts ?? {})}</td><td className="p-3"><Badge value={event.actionTaken} /></td><td className="p-3">{event.policyName ?? event.policyVersion ?? "-"}</td></tr>)}
    </Table>
  </Page>;
}

function Metric({ label, value }: { label: string; value: any }) { return <div className="card p-4"><p className="text-sm text-slate-500">{label}</p><div className="mt-2 font-semibold">{value}</div></div>; }
