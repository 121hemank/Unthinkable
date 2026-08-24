import { ReactNode, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const CALENDAR_MESSAGES: Record<string, { text: string; ok: boolean }> = {
  linked: { text: "Google Calendar linked successfully.", ok: true },
  denied: { text: "Calendar linking was cancelled or denied by Google.", ok: false },
  no_refresh_token: { text: "Google did not return a refresh token — please try again.", ok: false },
  invalid_state: { text: "Calendar link could not be verified — please try again.", ok: false },
};

/**
 * Shared layout for all three dashboards: header with identity + sign out,
 * plus a one-shot banner for the Google OAuth redirect result
 * (?calendar=linked|denied|... appended by the server callback).
 */
export function DashboardShell({
  title,
  subtitle,
  children,
  headerRight,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Optional widget (e.g. NotificationBell) rendered before the identity block. */
  headerRight?: ReactNode;
}) {
  const { user, logout } = useAuth();
  const [params, setParams] = useSearchParams();
  const [banner, setBanner] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    const flag = params.get("calendar");
    if (flag && CALENDAR_MESSAGES[flag]) {
      setBanner(CALENDAR_MESSAGES[flag]);
      // strip the query param so refresh doesn't re-show it
      params.delete("calendar");
      setParams(params, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-4">
            {headerRight}
            <span className="text-sm text-slate-500">{user?.email}</span>
            <button onClick={logout} className="text-sm text-slate-500 hover:text-slate-800">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {banner && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              banner.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-urgency-high"
            }`}
          >
            {banner.text}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
