import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Card, btnClass } from "./ui";

/** Shows OAuth link status and the "Link Google Calendar" entry point. */
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
      // The consent URL must be fetched via XHR so the JWT header is
      // attached; then we navigate the browser to Google ourselves.
      const { data } = await api.get<{ authUrl: string }>("/auth/google");
      window.location.href = data.authUrl;
    } catch (err: any) {
      setError(err?.response?.data?.error || "Could not start Google linking");
      setBusy(false);
    }
  }

  return (
    <Card title="Google Calendar sync">
      {linked === null ? (
        <p className="text-sm text-slate-500">Checking…</p>
      ) : linked ? (
        <p className="text-sm text-emerald-700">
          Your calendar is linked — confirmed appointments appear on it automatically.
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-500 mb-3">
            Link your Google Calendar so confirmed appointments are added automatically.
          </p>
          <button onClick={startLinking} disabled={busy} className={btnClass}>
            {busy ? "Redirecting…" : "Link Google Calendar"}
          </button>
          {error && <p className="text-sm text-urgency-high mt-3">{error}</p>}
        </>
      )}
    </Card>
  );
}
