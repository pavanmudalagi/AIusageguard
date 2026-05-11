import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Badge } from "../components/Badge";
import { FilterBar, Page, Table } from "./EndpointsPage";

export default function GenAIAppsPage() {
  const [items, setItems] = useState<any[]>([]);
  const load = () => api.get("/genai-apps").then((res) => setItems(res.data.items));
  useEffect(() => { load(); }, []);
  async function setStatus(id: string, approvedStatus: string) {
    await api.put(`/genai-apps/${id}/status`, { approvedStatus });
    load();
  }
  return (
    <Page title="GenAI Applications" subtitle="Discovered browser and desktop AI tools with approval controls.">
      <FilterBar filters={["Approved status", "Type", "Risk rating", "Last seen"]} />
      <Table headers={["App name", "Type", "Domain/executable", "Approved status", "Users", "Endpoints", "Prompts scanned", "Risk events", "Actions"]}>
        {items.map((item) => <tr key={item.id} className="border-t border-slate-200">
          <td className="p-3 font-medium">{item.name}</td><td className="p-3">{item.appType}</td><td className="p-3">{item.domain ?? item.executableName ?? "-"}</td><td className="p-3"><Badge value={item.approvedStatus} /></td><td className="p-3">demo</td><td className="p-3">demo</td><td className="p-3">demo</td><td className="p-3"><Badge value={item.riskRating} /></td>
          <td className="space-x-2 p-3"><button onClick={() => setStatus(item.id, "approved")} className="rounded-md bg-emerald-600 px-2 py-1 text-xs text-white">Approve</button><button onClick={() => setStatus(item.id, "restricted")} className="rounded-md bg-amber-600 px-2 py-1 text-xs text-white">Restrict</button><button onClick={() => setStatus(item.id, "blocked")} className="rounded-md bg-rose-600 px-2 py-1 text-xs text-white">Block</button></td>
        </tr>)}
      </Table>
    </Page>
  );
}
