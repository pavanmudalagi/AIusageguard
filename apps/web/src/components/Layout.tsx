import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Activity, Bell, Bot, Building2, DownloadCloud, GraduationCap, LayoutDashboard, ListChecks, LogOut, Mail, Monitor, Moon, Search, Settings, ShieldCheck, Siren, Sun, TriangleAlert } from "lucide-react";
import { api, logout } from "../api/client";

type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

const nav = [
  ["Dashboard", "/", LayoutDashboard],
  ["Endpoints", "/endpoints", Monitor],
  ["GenAI Apps", "/genai-apps", Bot],
  ["Risk Events", "/risk-events", Siren],
  ["Activity Events", "/activity-events", ListChecks],
  ["Alerts", "/alerts", TriangleAlert],
  ["Policies", "/policies", ShieldCheck],
  ["Browser Plugin Updates", "/browser-plugin/updates", DownloadCloud],
  ["Email Templates", "/templates", Mail],
  ["Education", "/education", GraduationCap],
  ["Settings", "/settings", Settings]
] as const;

function readStoredTheme(): ThemeMode {
  const stored = localStorage.getItem("aiug_theme");
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

function resolveTheme(theme: ThemeMode): ResolvedTheme {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function Layout() {
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<any[]>([]);
  const [theme, setTheme] = useState<ThemeMode>(readStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(readStoredTheme()));

  useEffect(() => {
    api.get("/orgs").then((res) => setOrgs(res.data.items ?? [])).catch(() => setOrgs([]));
  }, []);

  useEffect(() => {
    const applyTheme = () => {
      const nextResolvedTheme = resolveTheme(theme);
      const isDark = nextResolvedTheme === "dark";
      document.documentElement.classList.toggle("dark", isDark);
      document.documentElement.style.colorScheme = isDark ? "dark" : "light";
      setResolvedTheme(nextResolvedTheme);
      localStorage.setItem("aiug_theme", theme);
    };
    applyTheme();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 lg:flex">
      <aside className="border-r border-slate-200 bg-slate-950 text-slate-100 lg:w-72">
        <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-teal-500/15">
            <Activity className="h-5 w-5 text-teal-300" />
          </div>
          <div>
            <div className="font-bold">AI Usage Guard</div>
            <div className="text-xs text-slate-400">Security Console</div>
          </div>
        </div>
        <nav className="grid gap-1 p-3">
          {nav.map(([label, href, Icon]) => (
            <NavLink key={href} to={href} className={({ isActive }) => `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${isActive ? "bg-teal-500 text-white shadow-sm" : "text-slate-300 hover:bg-slate-900 hover:text-white"}`}>
              <Icon className="h-4 w-4" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="m-4 rounded-lg border border-teal-400/20 bg-teal-400/10 p-3 text-sm text-teal-100">
          <p className="font-semibold">Metadata only</p>
          <p className="mt-1 text-teal-100/80">Raw prompts, raw files, and PII values are not collected.</p>
        </div>
        <button className="mx-4 mb-4 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-900" onClick={() => { logout(); navigate("/login"); }}>
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-6 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-72 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              <Search className="h-4 w-4" />
              <input className="w-full bg-transparent text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500" placeholder="Search machines, users, AI tools, policies" />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
                <Building2 className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <select className="bg-transparent text-slate-700 outline-none dark:text-slate-100">
                  <option>All managed customers</option>
                  {orgs.map((org) => <option key={org.id}>{org.name}</option>)}
                </select>
              </div>
              <button className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900" aria-label="Notifications"><Bell className="h-4 w-4" /></button>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
                {resolvedTheme === "dark" ? <Moon className="h-4 w-4 text-slate-500 dark:text-slate-400" /> : <Sun className="h-4 w-4 text-slate-500 dark:text-slate-400" />}
                <select className="bg-transparent text-slate-700 outline-none dark:text-slate-100" value={theme} onChange={(event) => setTheme(event.target.value as ThemeMode)} aria-label="Theme">
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="system">System</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <div className="p-6 xl:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
