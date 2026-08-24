import { ReactNode } from "react";
import { initials } from "../lib/format";
const STATUS_STYLES: Record<string, string> = {
    HELD: "bg-amber-100 text-amber-800",
    CONFIRMED: "bg-primary-light text-primary-dark",
    CANCELLED: "bg-slate-200 text-slate-600",
    COMPLETED: "bg-emerald-100 text-emerald-800",
    RESCHEDULED: "bg-blue-100 text-blue-800",
};
const URGENCY_STYLES: Record<string, string> = {
    Low: "bg-green-100 text-urgency-low",
    Medium: "bg-amber-100 text-urgency-medium",
    High: "bg-red-100 text-urgency-high",
};
export function StatusBadge({ status }: {
    status: string;
}) {
    return (<span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] || "bg-slate-200 text-slate-600"}`}>
      {status}
    </span>);
}
export function UrgencyBadge({ level }: {
    level: string;
}) {
    return (<span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${URGENCY_STYLES[level] || "bg-slate-200 text-slate-600"}`}>
      {level} urgency
    </span>);
}
export function Card({ title, children, actions, }: {
    title?: string;
    children: ReactNode;
    actions?: ReactNode;
}) {
    return (<div className="bg-white rounded-xl border border-slate-200 p-6">
      {(title || actions) && (<div className="flex items-center justify-between mb-4">
          {title && <h2 className="text-lg font-semibold text-slate-900">{title}</h2>}
          {actions}
        </div>)}
      {children}
    </div>);
}
export const inputClass = "w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary";
export const btnClass = "bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 px-4 rounded-lg font-medium";
export function Stat({ label, value, accent }: {
    label: string;
    value: number;
    accent: string;
}) {
    return (<div className={`bg-white border border-slate-200 border-l-4 ${accent} rounded-xl px-5 py-4`}>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      <p className="text-xs uppercase tracking-wide text-slate-500 mt-0.5">{label}</p>
    </div>);
}
export function Avatar({ name, tone = "primary", size = "md", }: {
    name: string;
    tone?: "primary" | "emerald" | "slate";
    size?: "sm" | "md";
}) {
    const tones = {
        primary: "bg-primary-light text-primary-dark",
        emerald: "bg-emerald-100 text-emerald-700",
        slate: "bg-slate-200 text-slate-600",
    };
    return (<div className={`shrink-0 rounded-full flex items-center justify-center font-semibold ${tones[tone]} ${size === "sm" ? "w-9 h-9 text-xs" : "w-10 h-10 text-sm"}`}>
      {initials(name)}
    </div>);
}
