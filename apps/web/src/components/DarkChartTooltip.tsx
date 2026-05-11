import type { TooltipProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

export function DarkChartTooltip({ active, payload, label }: TooltipProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 text-sm text-slate-100 shadow-xl shadow-slate-950/40">
      {label !== undefined && label !== null && <div className="mb-1 font-semibold text-slate-200">{String(label)}</div>}
      <div className="space-y-1">
        {payload.map((item, index) => (
          <div key={`${String(item.name)}-${index}`} className="flex min-w-36 items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-slate-300">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color ?? item.fill ?? "#14b8a6" }} />
              {String(item.name ?? item.dataKey ?? "Value")}
            </span>
            <span className="font-semibold text-white">{String(item.value ?? "")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const chartAxisStyle = {
  tick: { fill: "currentColor", fontSize: 12 },
  axisLine: false,
  tickLine: false
};

export const chartGridStyle = {
  stroke: "currentColor",
  strokeOpacity: 0.12
};
