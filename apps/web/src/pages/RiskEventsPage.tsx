import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { Badge } from "../components/Badge";
import { FilterBar, Page, Table } from "./EndpointsPage";

export default function RiskEventsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [searchParams] = useSearchParams();
  useEffect(() => { api.get(`/events/risk?${searchParams.toString()}`).then((res) => setItems(res.data.items)); }, [searchParams]);
  return (
    <Page title="Risk Events" subtitle="Metadata-only telemetry. Raw prompt and raw file content are never displayed.">
      <FilterBar filters={["Date range", "Risk level", "Category", "GenAI app", "Action", "Input type", "Endpoint", "User"]} />
      <Table headers={["Timestamp", "Machine name", "User hash", "AI tool", "Event type", "Input type", "Risk level", "Detected categories", "Category counts", "Action taken", "Policy name", "Policy mode", "Policy version", "Scan status"]}>
        {items.map((item) => <tr key={item.id} className="border-t border-slate-200 dark:border-slate-800">
          <td className="p-3">{new Date(item.createdAt).toLocaleString()}</td><td className="p-3">{item.endpoint?.hostname}</td><td className="p-3">{item.endpointUser?.displayName ?? item.endpointUser?.userIdentifierHash ?? "-"}</td><td className="p-3">{item.genAIApplicationName}</td><td className="p-3">{item.eventType}</td><td className="p-3">{item.inputType}</td><td className="p-3"><Badge value={item.riskLevel} /></td><td className="p-3">{item.detectedCategories.join(", ") || "-"}</td><td className="p-3">{JSON.stringify(item.detectedCategoryCounts ?? item.metadata?.detectedCategoryCounts ?? {})}</td><td className="p-3"><Badge value={item.actionTaken} /></td><td className="p-3">{item.policyName ?? item.metadata?.policyName ?? "-"}</td><td className="p-3">{item.policyMode ?? item.metadata?.policyMode ?? "-"}</td><td className="p-3">{item.policyVersion ?? "-"}</td><td className="p-3">{item.scanStatus ?? item.metadata?.scanStatus ?? "-"}</td>
        </tr>)}
      </Table>
    </Page>
  );
}
