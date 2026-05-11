import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { Page } from "./EndpointsPage";

export default function SettingsPage() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [settings, setSettings] = useState<any>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.get("/orgs").then((res) => {
      const loaded = res.data.items ?? [];
      setOrgs(loaded);
      if (loaded[0]) setOrganizationId(loaded[0].id);
    });
  }, []);

  useEffect(() => {
    if (!organizationId) return;
    api.get(`/orgs/${organizationId}/settings`).then((res) => setSettings(res.data.item));
  }, [organizationId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const res = await api.put(`/orgs/${organizationId}/settings`, {
      uiTheme: form.get("uiTheme"),
      eventRetentionDays: Number(form.get("eventRetentionDays")),
      alertRetentionDays: Number(form.get("alertRetentionDays")),
      auditLogRetentionDays: Number(form.get("auditLogRetentionDays")),
      reportCleanPromptScans: form.get("reportCleanPromptScans") === "on",
      reportSensitiveEvents: form.get("reportSensitiveEvents") === "on",
      smtpEnabled: form.get("smtpEnabled") === "on",
      webhookEnabled: form.get("webhookEnabled") === "on"
    });
    setSettings(res.data.item);
    setMessage("Settings saved.");
  }

  return (
    <Page title="Settings" subtitle="Persisted organization, retention, privacy, and notification settings.">
      {message && <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{message}</p>}
      <form onSubmit={submit} className="grid gap-4 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Organization Details</h2>
          <label className="block text-sm font-medium">Organization/customer<select className="input mt-1" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>{orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Dashboard Defaults</h2>
          <label className="block text-sm font-medium">UI theme<select name="uiTheme" className="input mt-1" value={settings?.uiTheme ?? "system"} onChange={(event) => setSettings({ ...settings, uiTheme: event.target.value })}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></label>
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Data Retention</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <NumberField label="Events" name="eventRetentionDays" value={settings?.eventRetentionDays ?? 90} />
            <NumberField label="Alerts" name="alertRetentionDays" value={settings?.alertRetentionDays ?? 180} />
            <NumberField label="Audit logs" name="auditLogRetentionDays" value={settings?.auditLogRetentionDays ?? 365} />
          </div>
          <p className="mt-3 text-xs text-slate-500">POC retention settings are persisted but cleanup is manual/future scheduled work.</p>
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Privacy Settings</h2>
          <label className="flex items-center gap-2 text-sm"><input name="reportCleanPromptScans" type="checkbox" defaultChecked={Boolean(settings?.reportCleanPromptScans)} /> Report clean prompt scans</label>
          <label className="mt-3 flex items-center gap-2 text-sm"><input name="reportSensitiveEvents" type="checkbox" defaultChecked={settings?.reportSensitiveEvents !== false} /> Report sensitive events</label>
          <dl className="mt-4 grid gap-3 text-sm"><div className="flex justify-between"><dt>Raw prompt collection</dt><dd className="font-bold text-emerald-700">Disabled</dd></div><div className="flex justify-between"><dt>Raw file collection</dt><dd className="font-bold text-emerald-700">Disabled</dd></div><div className="flex justify-between"><dt>PII value storage</dt><dd className="font-bold text-emerald-700">Disabled</dd></div></dl>
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Notification Settings</h2>
          <label className="flex items-center gap-2 text-sm"><input name="smtpEnabled" type="checkbox" defaultChecked={Boolean(settings?.smtpEnabled)} /> SMTP enabled</label>
          <label className="mt-3 flex items-center gap-2 text-sm"><input name="webhookEnabled" type="checkbox" defaultChecked={Boolean(settings?.webhookEnabled)} /> Webhook enabled</label>
          <p className="mt-3 text-xs text-slate-500">SMTP and webhook secrets are stored encrypted/omitted in this POC.</p>
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Admin Users and Roles</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">Roles supported: super_admin, msp_admin, customer_admin, analyst, read_only.</p>
        </section>
        <div className="xl:col-span-2"><button className="rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white">Save settings</button></div>
      </form>
    </Page>
  );
}

function NumberField({ label, name, value }: { label: string; name: string; value: number }) {
  return <label className="block text-sm font-medium">{label}<input name={name} type="number" min={1} className="input mt-1" defaultValue={value} /></label>;
}
