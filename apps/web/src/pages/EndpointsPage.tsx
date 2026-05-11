import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../api/client";
import { Badge } from "../components/Badge";

export default function EndpointsPage() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api.get("/endpoints").then((res) => setItems(res.data.items)); }, []);
  return (
    <Page title="Endpoints" subtitle="Managed browser extensions and local endpoint agents.">
      <FilterBar filters={["Organization", "OS", "Policy status", "Last seen", "Agent installed", "Extension installed"]} />
      <Table headers={["Hostname", "OS", "Last seen", "Extension", "Agent", "Current policy", "Policy status", "Risk events", "Last risk event"]}>
        {items.map((item) => <tr key={item.id} className="border-t border-slate-200">
          <td className="p-3 font-medium">{item.hostname}</td><td className="p-3">{item.os} {item.osVersion}</td><td className="p-3">{fmt(item.lastSeenAt)}</td><td className="p-3">{item.browserExtensionVersion ?? "-"}</td><td className="p-3">{item.localAgentVersion ?? "-"}</td><td className="p-3">{item.currentPolicyVersion ?? "-"}</td><td className="p-3"><Badge value={item.policyStatus} /></td><td className="p-3">{item.events?.length ?? 0}</td><td className="p-3">{item.events?.[0]?.riskLevel ?? "-"}</td>
        </tr>)}
      </Table>
    </Page>
  );
}

export function Page({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <div className="space-y-4"><div><h1 className="text-2xl font-bold">{title}</h1><p className="text-sm text-slate-500">{subtitle}</p></div>{children}</div>;
}
export function FilterBar({ filters }: { filters: string[] }) {
  return <div className="card flex flex-wrap gap-2 p-3"><input className="min-w-64 rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Search" />{filters.map((filter) => <button key={filter} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">{filter}</button>)}</div>;
}
export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return <div className="card overflow-hidden"><table className="w-full min-w-[920px] text-sm"><thead className="table-head"><tr>{headers.map((header) => <th key={header} className="p-3">{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
function fmt(value?: string) { return value ? new Date(value).toLocaleString() : "-"; }
