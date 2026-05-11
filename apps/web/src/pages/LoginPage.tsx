import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { login } from "../api/client";

export default function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await login(String(form.get("email")), String(form.get("password")));
      navigate("/");
    } catch (error: any) {
      setError(error?.request && !error?.response ? "API server is not reachable on http://localhost:4000" : "Invalid email or password");
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-100 p-6 dark:bg-slate-950">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 text-slate-950 shadow-sm shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:shadow-none">
        <div className="mb-6 flex items-center gap-3">
          <ShieldCheck className="h-9 w-9 text-guard-teal" />
          <div>
            <h1 className="text-xl font-bold">AI Usage Guard</h1>
            <p className="text-sm text-slate-500">Admin dashboard login</p>
          </div>
        </div>
        <label className="mb-4 block text-sm font-medium text-slate-700 dark:text-slate-200">Email<input name="email" defaultValue="admin@secureflow.example" className="input mt-1" /></label>
        <label className="mb-4 block text-sm font-medium text-slate-700 dark:text-slate-200">Password<input name="password" type="password" defaultValue="Password123!" className="input mt-1" /></label>
        {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}
        <button className="w-full rounded-md bg-guard-teal px-4 py-2 font-semibold text-white">Sign in</button>
      </form>
    </div>
  );
}
