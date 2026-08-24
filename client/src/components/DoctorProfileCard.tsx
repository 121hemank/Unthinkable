import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { AuthUser, DoctorProfile, WeekdayKey, WorkingHoursSlot } from "../types";
import { Card, btnClass, inputClass } from "./ui";

const COMMON_SPECIALIZATIONS = [
  "General Physician",
  "Cardiology",
  "Dermatology",
  "Endocrinology",
  "Gastroenterology",
  "Neurology",
  "Obstetrics & Gynaecology",
  "Oncology",
  "Ophthalmology",
  "Orthopaedics",
  "Otolaryngology (ENT)",
  "Paediatrics",
  "Psychiatry",
  "Pulmonology",
  "Urology",
];

const WEEKDAYS: WeekdayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS: Record<WeekdayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

type Rows = Record<WeekdayKey, WorkingHoursSlot[]>;

/** "HH:MM" -> minutes since midnight */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(mins: number): string {
  const m = Math.min(23 * 60 + 59, Math.max(0, mins));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

const DEFAULT_WINDOW: WorkingHoursSlot = { start: "09:00", end: "17:00" };

function rowsFromProfile(p: DoctorProfile | null): Rows {
  const rows = {} as Rows;
  for (const day of WEEKDAYS) {
    if (p) {
      rows[day] = (p.workingHours?.[day] ?? []).map((w) => ({ ...w }));
    } else {
      // Friendly default for a brand-new doctor: Mon–Fri office hours
      rows[day] = day === "sat" || day === "sun" ? [] : [{ ...DEFAULT_WINDOW }];
    }
  }
  return rows;
}

const DURATION_OPTIONS = [15, 20, 30, 45, 60];

/**
 * Lets a doctor manage their own profile: specialization, slot length and
 * weekly consulting hours. Each day can have SEVERAL windows — e.g.
 * 09:00-13:00 + 16:00-20:00 leaves a lunch gap in between that simply gets
 * no slots. Saving creates/updates their DoctorProfile server-side.
 */
export function DoctorProfileCard() {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [name, setName] = useState("");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const [specialization, setSpecialization] = useState("");
  const [duration, setDuration] = useState(30);
  const [rows, setRows] = useState<Rows>(() => rowsFromProfile(null));
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) setName(user.name);
  }, [user]);

  useEffect(() => {
    api
      .get<{ profile: DoctorProfile | null }>("/doctors/me/profile")
      .then(({ data }) => {
        setProfile(data.profile);
        setSpecialization(data.profile?.specialization || "");
        setRows(rowsFromProfile(data.profile));
        const d = data.profile?.slotDurationMinutes;
        setDuration(d && DURATION_OPTIONS.includes(d) ? d : d || 30);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function saveName() {
    setNameBusy(true);
    setNameMsg(null);
    try {
      const { data } = await api.put<{ user: AuthUser }>("/auth/me", { name: name.trim() });
      updateUser(data.user); // updates header + localStorage instantly
      setNameMsg("Name updated.");
    } catch (err: any) {
      setNameMsg(err?.response?.data?.error || "Could not update your name");
    } finally {
      setNameBusy(false);
    }
  }

  function toggleDay(day: WeekdayKey, on: boolean) {
    setRows((prev) => ({ ...prev, [day]: on ? [{ ...DEFAULT_WINDOW }] : [] }));
    setSavedMsg(null);
  }

  function updateWindow(day: WeekdayKey, i: number, patch: Partial<WorkingHoursSlot>) {
    setRows((prev) => ({
      ...prev,
      [day]: prev[day].map((w, idx) => (idx === i ? { ...w, ...patch } : w)),
    }));
    setSavedMsg(null);
  }

  function addWindow(day: WeekdayKey) {
    setRows((prev) => {
      const last = prev[day][prev[day].length - 1];
      // Start the new window right after the previous one ends (+30 min breather)
      const start = last ? toHHMM(toMinutes(last.end) + 30) : DEFAULT_WINDOW.start;
      return { ...prev, [day]: [...prev[day], { start, end: toHHMM(toMinutes(start) + 180) }] };
    });
    setSavedMsg(null);
  }

  function removeWindow(day: WeekdayKey, i: number) {
    setRows((prev) => ({ ...prev, [day]: prev[day].filter((_, idx) => idx !== i) }));
    setSavedMsg(null);
  }

  async function save() {
    setError(null);
    setSavedMsg(null);

    const workingHours: Partial<Record<WeekdayKey, WorkingHoursSlot[]>> = {};
    for (const day of WEEKDAYS) {
      const windows = rows[day];
      if (windows.length === 0) continue;

      for (const w of windows) {
        if (!w.start || !w.end || w.start >= w.end) {
          setError(`${DAY_LABELS[day]}: every consult window must end after it starts.`);
          return;
        }
      }
      const sorted = [...windows].sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].start < sorted[i - 1].end) {
          setError(
            `${DAY_LABELS[day]}: your windows overlap (${sorted[i - 1].end} vs ${sorted[i].start}) — leave a gap for lunch between them.`
          );
          return;
        }
      }
      workingHours[day] = sorted;
    }

    if (Object.keys(workingHours).length === 0) {
      setError("Enable at least one day so patients can book you.");
      return;
    }

    setBusy(true);
    try {
      const { data } = await api.put<{ profile: DoctorProfile }>("/doctors/me/profile", {
        specialization: specialization.trim(),
        slotDurationMinutes: duration,
        workingHours,
      });
      setProfile(data.profile);
      setSavedMsg(
        `Saved — patients can find you as “${data.profile.specialization}” and book ${data.profile.slotDurationMinutes}-min slots on ${Object.keys(workingHours).length} day(s).`
      );
    } catch (err: any) {
      setError(err?.response?.data?.error || "Could not save your profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="My profile & availability">
      {!loaded ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-5">
          {!profile && (
            <p className="text-sm bg-amber-50 text-urgency-medium rounded-lg px-3 py-2">
              Finish this once — until you save it, patients can't find or book you.
            </p>
          )}

          {/* Name (typo fixes) */}
          <div>
            <label className="block text-sm text-slate-600 mb-1">Your name</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                className={inputClass}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameMsg(null);
                }}
                placeholder="Dr. name as patients should see it"
              />
              <button
                onClick={saveName}
                disabled={
                  nameBusy || name.trim().length < 2 || name.trim() === user?.name
                }
                className={btnClass}
              >
                {nameBusy ? "Saving…" : "Update name"}
              </button>
            </div>
            {nameMsg && <p className={`text-sm mt-2 ${nameMsg === "Name updated." ? "text-emerald-700" : "text-urgency-high"}`}>{nameMsg}</p>}
          </div>

          {/* Specialization */}
          <div>
            <label className="block text-sm text-slate-600 mb-1">Specialization</label>
            <input
              list="common-specializations"
              className={inputClass}
              placeholder="e.g. Cardiology"
              value={specialization}
              onChange={(e) => {
                setSpecialization(e.target.value);
                setSavedMsg(null);
              }}
            />
            <datalist id="common-specializations">
              {COMMON_SPECIALIZATIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          {/* Slot duration */}
          <div>
            <label className="block text-sm text-slate-600 mb-1">Appointment slot length</label>
            <select
              className={inputClass}
              value={duration}
              onChange={(e) => {
                setDuration(Number(e.target.value));
                setSavedMsg(null);
              }}
            >
              {[...new Set([...DURATION_OPTIONS, duration])].sort((a, b) => a - b).map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </div>

          {/* Weekly working hours — multiple windows per day allowed */}
          <div>
            <label className="block text-sm text-slate-600 mb-2">
              Consulting hours (Indian Standard Time) — add a second window to block out lunch
            </label>
            <div className="space-y-3">
              {WEEKDAYS.map((day) => {
                const has = rows[day].length > 0;
                return (
                  <div key={day} className="flex items-start gap-3">
                    <label className="flex items-center gap-2 w-32 pt-2 cursor-pointer">
                      <input type="checkbox" checked={has} onChange={(e) => toggleDay(day, e.target.checked)} />
                      <span className="text-sm text-slate-700">{DAY_LABELS[day]}</span>
                    </label>
                    <div className="space-y-2">
                      {has ? (
                        <>
                          {rows[day].map((w, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <input
                                type="time"
                                className={`${inputClass} !w-32`}
                                value={w.start}
                                onChange={(e) => updateWindow(day, i, { start: e.target.value })}
                              />
                              <span className="text-slate-400 text-sm">to</span>
                              <input
                                type="time"
                                className={`${inputClass} !w-32`}
                                value={w.end}
                                onChange={(e) => updateWindow(day, i, { end: e.target.value })}
                              />
                              {rows[day].length > 1 && (
                                <button
                                  onClick={() => removeWindow(day, i)}
                                  title="Remove this window"
                                  className="text-slate-400 hover:text-urgency-high px-1"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            onClick={() => addWindow(day)}
                            className="text-sm text-primary font-medium"
                          >
                            + Add window (e.g. evening after lunch)
                          </button>
                        </>
                      ) : (
                        <p className="text-sm text-slate-400 pt-1.5">Not consulting</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button onClick={save} disabled={busy || specialization.trim().length < 2} className={btnClass}>
            {busy ? "Saving…" : "Save profile"}
          </button>

          {savedMsg && <p className="text-sm text-emerald-700">{savedMsg}</p>}
          {error && <p className="text-sm text-urgency-high">{error}</p>}
        </div>
      )}
    </Card>
  );
}
