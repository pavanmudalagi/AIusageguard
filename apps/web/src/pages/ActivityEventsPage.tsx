import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { Badge } from "../components/Badge";
import { Page, Table } from "./EndpointsPage";

export default function ActivityEventsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    api.get(`/events/activity?${searchParams.toString()}`).then((res) => setItems(res.data.items));
  }, [searchParams]);

  return (
    <Page title="Activity Events" subtitle="All Browser Shield metadata events, including non-risk detections and policy sync activity.">
      <Table headers={["Timestamp", "Machine name", "AI tool", "Event type", "Input type", "Action", "Policy", "Plugin version"]}>
        {items.map((item) => (
          <tr key={item.id} className="border-t border-slate-200 dark:border-slate-800">
            <td className="p-3">{new Date(item.createdAt).toLocaleString()}</td>
            <td className="p-3">{item.endpoint?.hostname ?? item.metadata?.machineName ?? "-"}</td>
            <td className="p-3">{item.genAIApplicationName}</td>
            <td className="p-3">{item.eventType}</td>
            <td className="p-3">{item.inputType}</td>
            <td className="p-3"><Badge value={item.actionTaken} /></td>
            <td className="p-3">{item.policyName ?? item.metadata?.policyName ?? item.policyVersion ?? "-"}</td>
            <td className="p-3">{item.metadata?.pluginVersion ?? "-"}</td>
          </tr>
        ))}
      </Table>
    </Page>
  );
}
