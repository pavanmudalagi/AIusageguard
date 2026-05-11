import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Badge } from "../components/Badge";
import { Page, Table } from "./EndpointsPage";

export default function PoliciesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [assigning, setAssigning] = useState<any>(null);
  const load = () => api.get("/policies").then((res) => setItems(res.data.items));
  useEffect(() => {
    load();
    api.get("/orgs").then((res) => setOrgs(res.data.items ?? []));
  }, []);
  async function action(id: string, name: "publish" | "archive" | "duplicate") {
    await api.post(`/policies/${id}/${name}`);
    load();
  }
  return (
    <Page title="Policy Management" subtitle="Create, publish, archive, assign, and track delivery status.">
      <div className="mb-4 flex justify-end"><Link to="/policies/new" className="rounded-md bg-guard-teal px-4 py-2 text-sm font-semibold text-white">Create policy</Link></div>
      <Table headers={["Name", "Version", "Status", "Mode", "Assigned", "Last updated", "Published", "Delivery", "Actions"]}>
        {items.map((item) => <tr key={item.id} className="border-t border-slate-200 dark:border-slate-800">
          <td className="p-3 font-medium">{item.name}</td>
          <td className="p-3">{item.version}</td>
          <td className="p-3"><Badge value={item.status} /></td>
          <td className="p-3">{item.policyJson?.mode}</td>
          <td className="p-3">{item.assignedScopeCount ?? item.assignments?.length ?? 0}</td>
          <td className="p-3">{new Date(item.updatedAt).toLocaleString()}</td>
          <td className="p-3">{item.publishedAt ? new Date(item.publishedAt).toLocaleString() : "-"}</td>
          <td className="p-3">{item.deliverySummary?.applied ?? 0} applied, {item.deliverySummary?.pending ?? 0} pending, {item.deliverySummary?.failed ?? 0} failed</td>
          <td className="space-x-2 p-3">
            <Link to={`/policies/${item.id}`} className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700">View</Link>
            <Link to={`/policies/${item.id}/edit`} className="rounded-md bg-slate-700 px-2 py-1 text-xs text-white">Edit</Link>
            <button onClick={() => action(item.id, "duplicate")} className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700">Duplicate</button>
            {item.status === "draft" && <button onClick={() => action(item.id, "publish")} className="rounded-md bg-blue-600 px-2 py-1 text-xs text-white">Publish</button>}
            <button onClick={() => action(item.id, "archive")} className="rounded-md bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50" disabled={item.status === "archived"}>Archive</button>
            <button onClick={() => setAssigning(item)} className="rounded-md bg-guard-teal px-2 py-1 text-xs text-white disabled:opacity-50" disabled={item.status !== "published"}>Assign</button>
          </td>
        </tr>)}
      </Table>
      {assigning && <AssignModal policy={assigning} orgs={orgs} onClose={() => setAssigning(null)} onSaved={() => { setAssigning(null); load(); }} />}
    </Page>
  );
}

function AssignModal({ policy, orgs, onClose, onSaved }: { policy: any; orgs: any[]; onClose: () => void; onSaved: () => void }) {
  const [organizationId, setOrganizationId] = useState(policy.organizationId);
  const [assignmentType, setAssignmentType] = useState("organization");
  const [targetId, setTargetId] = useState(policy.organizationId);
  const [applyImmediately, setApplyImmediately] = useState(true);
  async function save() {
    await api.post(`/policies/${policy.id}/assign`, { organizationId, assignmentType, targetId: assignmentType === "organization" ? organizationId : targetId, applyImmediately });
    onSaved();
  }
  return <div className="enterprise-modal-backdrop">
    <div className="card w-full max-w-lg p-5">
      <h2 className="text-lg font-bold">Assign Policy</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{policy.name} v{policy.version}</p>
      <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-200">Organization/customer<select className="input mt-1" value={organizationId} onChange={(event) => { setOrganizationId(event.target.value); setTargetId(event.target.value); }}>{orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
      <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-200">Assignment type<select className="input mt-1" value={assignmentType} onChange={(event) => setAssignmentType(event.target.value)}><option value="organization">Organization/customer</option><option value="endpoint">Specific endpoint</option><option value="device_group">Endpoint group</option><option value="user_group">User group</option></select></label>
      {assignmentType !== "organization" && <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-200">Target ID<input className="input mt-1" value={targetId} onChange={(event) => setTargetId(event.target.value)} /></label>}
      <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={applyImmediately} onChange={(event) => setApplyImmediately(event.target.checked)} /> Apply immediately</label>
      <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="enterprise-button">Cancel</button><button onClick={save} className="rounded-md bg-guard-teal px-3 py-2 text-sm font-semibold text-white">Save assignment</button></div>
    </div>
  </div>;
}
