import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { Badge } from "../components/Badge";
import { Page, Table } from "./EndpointsPage";

export default function TemplatesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    Promise.all([api.get("/templates"), api.get("/orgs")]).then(([templateRes, orgRes]) => {
      setItems(templateRes.data.items ?? []);
      const loadedOrgs = orgRes.data.items ?? [];
      setOrgs(loadedOrgs);
      setOrganizationId(loadedOrgs[0]?.id ?? "");
    });
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api.post("/templates", {
      organizationId,
      name: form.get("name"),
      type: form.get("type"),
      subject: form.get("subject"),
      body: form.get("body"),
      variables: String(form.get("variables") ?? "").split(",").map((item) => item.trim()).filter(Boolean),
      status: "draft",
      version: "1.0"
    });
    setMessage("Template saved.");
    event.currentTarget.reset();
    const res = await api.get("/templates");
    setItems(res.data.items ?? []);
  }

  async function action(id: string, actionName: "publish" | "archive" | "duplicate") {
    await api.post(`/templates/${id}/${actionName}`);
    const res = await api.get("/templates");
    setItems(res.data.items ?? []);
  }

  return <Page title="Email Templates" subtitle="Persisted education, coaching, and notification templates.">
    {message && <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{message}</p>}
    <form onSubmit={submit} className="card mb-5 grid gap-3 p-5 xl:grid-cols-2">
      <label className="block text-sm font-medium">Organization<select className="input mt-1" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>{orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
      <label className="block text-sm font-medium">Type<select name="type" className="input mt-1" defaultValue="user_coaching"><option value="email">Email</option><option value="education_blog">Education blog</option><option value="user_coaching">User coaching</option><option value="notification">Notification</option></select></label>
      <label className="block text-sm font-medium">Name<input name="name" className="input mt-1" required /></label>
      <label className="block text-sm font-medium">Subject<input name="subject" className="input mt-1" /></label>
      <label className="block text-sm font-medium xl:col-span-2">Body<textarea name="body" className="input mt-1 min-h-32" required /></label>
      <label className="block text-sm font-medium">Variables<input name="variables" className="input mt-1" placeholder="userName, machineName" /></label>
      <div className="flex items-end"><button className="rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white">Save template</button></div>
    </form>
    <Table headers={["Name", "Type", "Status", "Version", "Subject", "Actions"]}>
      {items.map((item) => <tr key={item.id} className="border-t border-slate-200 dark:border-slate-800">
        <td className="p-3 font-semibold">{item.name}</td><td className="p-3">{item.type}</td><td className="p-3"><Badge value={item.status} /></td><td className="p-3">{item.version}</td><td className="p-3">{item.subject ?? "-"}</td>
        <td className="space-x-2 p-3"><button onClick={() => action(item.id, "publish")} className="enterprise-button px-2 py-1 text-xs">Publish</button><button onClick={() => action(item.id, "duplicate")} className="enterprise-button px-2 py-1 text-xs">Duplicate</button><button onClick={() => action(item.id, "archive")} className="enterprise-button px-2 py-1 text-xs">Archive</button></td>
      </tr>)}
    </Table>
  </Page>;
}
