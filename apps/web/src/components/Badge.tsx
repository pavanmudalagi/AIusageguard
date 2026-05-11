export function Badge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone = normalized.includes("critical") || normalized.includes("blocked") || normalized.includes("failed") || normalized.includes("outdated")
    ? "border border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-950/70 dark:text-rose-200"
    : normalized.includes("high") || normalized.includes("warn") || normalized.includes("pending") || normalized.includes("passive")
      ? "border border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950/70 dark:text-amber-200"
      : normalized.includes("approved") || normalized.includes("applied") || normalized.includes("allowed") || normalized.includes("active")
        ? "border border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-200"
        : "border border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
  return <span className={`badge ${tone}`}>{value.replaceAll("_", " ")}</span>;
}
