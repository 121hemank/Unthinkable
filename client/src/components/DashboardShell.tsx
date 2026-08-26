import { ReactNode, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
const CALENDAR_MESSAGES: Record<string, {
    text: string;
    ok: boolean;
}> = {
    linked: { text: "Google Calendar linked successfully.", ok: true },
    denied: { text: "Calendar linking was cancelled or denied by Google.", ok: false },
    no_refresh_token: { text: "Google did not return a refresh token — please try again.", ok: false },
    invalid_state: { text: "Calendar link could not be verified — please try again.", ok: false },
};
export function DashboardShell({ title, subtitle, children, headerRight, }: {
    title: string;
    subtitle?: string;
    children: ReactNode;
    headerRight?: ReactNode;
}) {
    const { user, logout } = useAuth();
    const [params, setParams] = useSearchParams();
    const [banner, setBanner] = useState<{
        text: string;
        ok: boolean;
    } | null>(null);
    useEffect(() => {
        const flag = params.get("calendar");
        if (flag && CALENDAR_MESSAGES[flag]) {
            setBanner(CALENDAR_MESSAGES[flag]);
            params.delete("calendar");
            setParams(params, { replace: true });
        }
    }, []);
    return (<div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-primary text-white flex items-center justify-center font-bold text-sm shrink-0">C</span>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-semibold text-slate-900 truncate">{title}</h1>
              {subtitle && <p className="text-xs sm:text-sm text-slate-500 truncate">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {headerRight}
            <span className="hidden sm:inline-block rounded-full bg-primary-light text-primary-dark px-2.5 py-0.5 text-xs font-semibold capitalize">
              {user?.role}
            </span>
            <span className="hidden md:inline text-sm text-slate-500 truncate max-w-[180px]">{user?.email}</span>
            <button onClick={logout} className="text-sm font-medium text-slate-600 hover:text-white hover:bg-slate-700 border border-slate-300 rounded-lg px-3 py-1.5 transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        {banner && (<div className={`rounded-lg px-4 py-3 text-sm ${banner.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-urgency-high"}`}>
            {banner.text}
          </div>)}
        {children}
      </main>
    </div>);
}
