import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { NotificationLogT } from "../types";

const TYPE_LABEL: Record<NotificationLogT["type"], string> = {
  BOOKING_CONFIRM: "Booking confirmed",
  REMINDER: "Medication reminder",
  CANCELLATION: "Cancellation",
  RESCHEDULED: "Rescheduled",
  LEAVE_CONFLICT: "Doctor unavailable",
};

const STATUS_DOT: Record<NotificationLogT["status"], string> = {
  SENT: "bg-emerald-500",
  PENDING: "bg-amber-500",
  FAILED: "bg-red-500",
};

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Header bell fed by the platform's own NotificationLog — every email and
 * calendar sync the system attempted for this user shows up here, including
 * delivery status. Polls every minute; badge counts the last 24 hours.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationLogT[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api
      .get("/notifications/mine")
      .then(({ data }) => setItems(data.notifications))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const recentCount = items.filter(
    (n) => Date.now() - new Date(n.createdAt).getTime() < 86_400_000
  ).length;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative w-9 h-9 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:border-primary hover:text-primary transition-colors"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {recentCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-primary text-white text-[10px] font-semibold flex items-center justify-center px-1">
            {recentCount > 9 ? "9+" : recentCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white rounded-xl border border-slate-200 shadow-lg z-50">
          <p className="px-4 py-3 text-sm font-semibold text-slate-900 border-b border-slate-100 sticky top-0 bg-white">
            Notifications
          </p>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400 text-center">
              Nothing yet — booking updates will appear here.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((n) => (
                <li key={n._id} className="px-4 py-2.5 flex items-start gap-2.5">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[n.status]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-900 leading-snug">
                      {TYPE_LABEL[n.type]}
                      <span className="text-slate-400 font-normal"> · {n.channel === "EMAIL" ? "email" : "calendar"}</span>
                    </p>
                    <p className="text-xs text-slate-400">{timeAgo(n.createdAt)}</p>
                    {n.status === "FAILED" && n.lastError && (
                      <p className="text-xs text-urgency-high mt-0.5 break-words" title={n.lastError}>
                        Delivery failed — will retry automatically.
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
