import { ReactNode } from "react";
import { initials } from "../lib/format";
const STATUS_STYLES: Record<string, string> = {
    HELD: "bg-amber-50 text-amber-700 ring-amber-200",
    CONFIRMED: "bg-teal-50 text-teal-700 ring-teal-200",
    CANCELLED: "bg-slate-100 text-slate-500 ring-slate-200",
    COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    RESCHEDULED: "bg-blue-50 text-blue-700 ring-blue-200",
};
const URGENCY_STYLES: Record<string, string> = {
    Low: "bg-green-50 text-urgency-low ring-green-200",
    Medium: "bg-amber-50 text-urgency-medium ring-amber-200",
    High: "bg-red-50 text-urgency-high ring-red-200",
};
export function StatusBadge({ status }: {
    status: string;
}) {
    return (<span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ${STATUS_STYLES[status] || "bg-slate-100 text-slate-500 ring-slate-200"}`}>
      {status}
    </span>);
}
export function UrgencyBadge({ level }: {
    level: string;
}) {
    return (<span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${URGENCY_STYLES[level] || "bg-slate-100 text-slate-500 ring-slate-200"}`}>
      {level} urgency
    </span>);
}
export function Card({ title, children, actions, }: {
    title?: string;
    children: ReactNode;
    actions?: ReactNode;
}) {
    return (<div className="bg-white rounded-2xl ring-1 ring-slate-200/70 shadow-sm shadow-slate-200/50 p-5 sm:p-6">
      {(title || actions) && (<div className="flex items-center justify-between gap-3 mb-4">
          {title && <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">{title}</h2>}
          {actions}
        </div>)}
      {children}
    </div>);
}
export const inputClass = "w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm placeholder:text-slate-400 transition-colors focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
export const btnClass = "inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none text-white py-2.5 px-5 rounded-xl text-sm font-semibold shadow-sm shadow-teal-600/20 transition-all";
export function Stat({ label, value, accent }: {
    label: string;
    value: number;
    accent: string;
}) {
    return (<div className={`bg-white ring-1 ring-slate-200/70 shadow-sm shadow-slate-200/50 border-l-4 ${accent} rounded-2xl px-5 py-4`}>
      <p className="text-[26px] leading-none font-extrabold tracking-tight text-slate-900 tabular-nums">{value}</p>
      <p className="text-xs font-medium text-slate-500 mt-1.5">{label}</p>
    </div>);
}
export function Avatar({ name, tone = "primary", size = "md", }: {
    name: string;
    tone?: "primary" | "emerald" | "slate";
    size?: "sm" | "md";
}) {
    const tones = {
        primary: "bg-gradient-to-br from-teal-100 to-cyan-100 text-teal-800",
        emerald: "bg-gradient-to-br from-emerald-100 to-green-100 text-emerald-700",
        slate: "bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600",
    };
    return (<div className={`shrink-0 rounded-full flex items-center justify-center font-bold ring-1 ring-black/5 ${tones[tone]} ${size === "sm" ? "w-9 h-9 text-xs" : "w-10 h-10 text-sm"}`}>
      {initials(name)}
    </div>);
}
