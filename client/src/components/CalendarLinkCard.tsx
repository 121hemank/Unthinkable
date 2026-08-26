import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Card, btnClass } from "./ui";
export function CalendarLinkCard() {
    const [linked, setLinked] = useState<boolean | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        api
            .get("/auth/calendar/status")
            .then(({ data }) => setLinked(data.linked))
            .catch(() => setLinked(false));
    }, []);
    async function startLinking() {
        setBusy(true);
        setError(null);
        try {
            const { data } = await api.get<{
                authUrl: string;
            }>("/auth/google");
            window.location.href = data.authUrl;
        }
        catch (err: any) {
            setError(err?.response?.data?.error || "Could not start Google linking");
            setBusy(false);
        }
    }
    if (linked) {
        return (<div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 ring-1 ring-emerald-100 px-4 py-3 text-sm text-emerald-800">
        <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[11px] font-bold shrink-0">✓</span>
        <span><strong>Calendar synced</strong> — confirmed visits appear on your Google Calendar automatically.</span>
      </div>);
    }
    return (<Card title="Google Calendar sync">
      <p className="text-sm text-slate-500 mb-4">
        Link your Google account once — every confirmed or rescheduled visit is
        added to your calendar automatically, with reminders before it starts.
      </p>
      <button onClick={startLinking} disabled={busy} className={`${btnClass} w-full sm:w-auto`}>
        {busy ? "Redirecting…" : "Sync Google Calendar"}
      </button>
      {error && <p className="text-sm text-urgency-high mt-3">{error}</p>}
    </Card>);
}
