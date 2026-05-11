import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Badge } from "../components/Badge";
import { Page, Table } from "./EndpointsPage";

export default function AlertsPage() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api.get("/alerts").then((res) => setItems(res.data.items ?? [])); }, []);

  async function setStatus(id: string, status: string) {
    await api.put(`/alerts/${id}/status`, { status });
    const res = await api.get("/alerts");
    setItems(res.data.items ?? []);
  }

  return <Page title="Alerts" subtitle="Persisted operational alerts created from metadata-only events.">
    <Table headers={["Created", "Title", "Severity", "Status", "AI app", "Categories", "Actions"]}>
      {items.map((item) => <tr key={item.id} className="border-t border-slate-200 dark:border-slate-800">
        <td className="p-3">{new Date(item.createdAt).toLocaleString()}</td>
        <td className="p-3 font-semibold">{item.title}</td>
        <td className="p-3"><Badge value={item.severity} /></td>
        <td className="p-3"><Badge value={item.status} /></td>
        <td className="p-3">{item.genAIAppName ?? "-"}</td>
        <td className="p-3">{item.detectedCategories?.join(", ") || "-"}</td>
        <td className="space-x-2 p-3"><button onClick={() => setStatus(item.id, "investigating")} className="enterprise-button px-2 py-1 text-xs">Investigate</button><button onClick={() => setStatus(item.id, "resolved")} className="enterprise-button px-2 py-1 text-xs">Resolve</button></td>
      </tr>)}
    </Table>
  </Page>;
}
