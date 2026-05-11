import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Badge } from "../components/Badge";
import { Page, Table } from "./EndpointsPage";

export default function EducationPage() {
  const [items, setItems] = useState<any[]>([]);
  const [draft, setDraft] = useState<any>(null);
  useEffect(() => { api.get("/education/recommendations").then((res) => setItems(res.data.items)); }, []);
  async function generate(categories: string[]) {
    const res = await api.post("/education/generate-draft", { categories });
    setDraft(res.data);
  }
  return (
    <Page title="Education" subtitle="Template-based education using category summaries only.">
      <Table headers={["User", "Endpoint", "Risky events", "Categories", "Topic", "Status", "Actions"]}>
        {items.map((item) => <tr key={item.id} className="border-t border-slate-200">
          <td className="p-3">{item.userIdentifierHash}</td><td className="p-3">{item.endpointId ?? "-"}</td><td className="p-3">{item.riskyEventCount}</td><td className="p-3">{item.categories.join(", ")}</td><td className="p-3">{item.recommendedTopic}</td><td className="p-3"><Badge value={item.status} /></td><td className="p-3"><button onClick={() => generate(item.categories)} className="rounded-md bg-guard-teal px-2 py-1 text-xs text-white">Generate draft</button></td>
        </tr>)}
      </Table>
      {draft && <div className="card p-5"><h2 className="mb-3 text-lg font-bold">{draft.title}</h2><pre className="whitespace-pre-wrap text-sm text-slate-700">{draft.body}</pre></div>}
    </Page>
  );
}
