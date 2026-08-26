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
const DAY_SHORT: Record<WeekdayKey, string> = {
    mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};
const DAY_LABELS: Record<WeekdayKey, string> = {
    mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
    fri: "Friday", sat: "Saturday", sun: "Sunday",
};
type Rows = Record<WeekdayKey, WorkingHoursSlot[]>;
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
        }
        else {
            rows[day] = day === "sat" || day === "sun" ? [] : [{ ...DEFAULT_WINDOW }];
        }
    }
    return rows;
}
const DURATION_OPTIONS = [15, 20, 30, 45, 60];
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
        if (user)
            setName(user.name);
    }, [user]);
    useEffect(() => {
        api
            .get<{
            profile: DoctorProfile | null;
        }>("/doctors/me/profile")
            .then(({ data }) => {
            setProfile(data.profile);
            setSpecialization(data.profile?.specialization || "");
            setRows(rowsFromProfile(data.profile));
            const d = data.profile?.slotDurationMinutes;
            setDuration(d && DURATION_OPTIONS.includes(d) ? d : d || 30);
        })
            .catch(() => { })
            .finally(() => setLoaded(true));
    }, []);
    async function saveName() {
        setNameBusy(true);
        setNameMsg(null);
        try {
            const { data } = await api.put<{
                user: AuthUser;
            }>("/auth/me", { name: name.trim() });
            updateUser(data.user);
            setNameMsg("Name updated.");
        }
        catch (err: any) {
            setNameMsg(err?.response?.data?.error || "Could not update your name");
        }
        finally {
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
            if (windows.length === 0)
                continue;
            for (const w of windows) {
                if (!w.start || !w.end || w.start >= w.end) {
                    setError(`${DAY_LABELS[day]}: every consult window must end after it starts.`);
                    return;
                }
            }
            const sorted = [...windows].sort((a, b) => a.start.localeCompare(b.start));
            for (let i = 1; i < sorted.length; i++) {
                if (sorted[i].start < sorted[i - 1].end) {
                    setError(`${DAY_LABELS[day]}: your windows overlap (${sorted[i - 1].end} vs ${sorted[i].start}) — leave a gap for lunch between them.`);
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
            const { data } = await api.put<{
                profile: DoctorProfile;
            }>("/doctors/me/profile", {
                specialization: specialization.trim(),
                slotDurationMinutes: duration,
                workingHours,
            });
            setProfile(data.profile);
            setSavedMsg(`Saved — patients can book ${data.profile.slotDurationMinutes}-min slots on ${Object.keys(workingHours).length} day(s).`);
        }
        catch (err: any) {
            setError(err?.response?.data?.error || "Could not save your profile");
        }
        finally {
            setBusy(false);
        }
    }
    const timeInput = `${inputClass} !w-[86px] !px-2 !py-1.5 !text-xs`;
    return (<Card title="My profile & availability">
      {!loaded ? (<p className="text-sm text-slate-500">Loading…</p>) : (<div className="space-y-5">
          {!profile && (<p className="text-xs bg-amber-50 text-urgency-medium rounded-lg px-3 py-2 ring-1 ring-amber-100">
              Finish this once — until you save it, patients can't find or book you.
            </p>)}

          
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Display name</label>
            <div className="flex gap-2">
              <input className={inputClass} value={name} onChange={(e) => {
                setName(e.target.value);
                setNameMsg(null);
            }} placeholder="Dr. name as patients see it"/>
              <button onClick={saveName} disabled={nameBusy || name.trim().length < 2 || name.trim() === user?.name} className={`${btnClass} !px-3 !py-2 shrink-0`}>
                {nameBusy ? "…" : "Update"}
              </button>
            </div>
            {nameMsg && <p className={`text-xs mt-1.5 ${nameMsg === "Name updated." ? "text-emerald-700" : "text-urgency-high"}`}>{nameMsg}</p>}
          </div>

          
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Specialization</label>
            <input list="common-specializations" className={inputClass} placeholder="e.g. Cardiology" value={specialization} onChange={(e) => {
                setSpecialization(e.target.value);
                setSavedMsg(null);
            }}/>
            <datalist id="common-specializations">
              {COMMON_SPECIALIZATIONS.map((s) => (<option key={s} value={s}/>))}
            </datalist>
          </div>

          
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Slot length</label>
            <div className="grid grid-cols-5 gap-1.5">
              {DURATION_OPTIONS.map((m) => (<button key={m} onClick={() => { setDuration(m); setSavedMsg(null); }} className={`rounded-lg py-1.5 text-xs font-semibold ring-1 transition-colors ${duration === m ? "bg-primary text-white ring-primary shadow-sm shadow-teal-600/25" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"}`}>
                  {m}m
                </button>))}
            </div>
          </div>

          
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Weekly hours</label>
              <span className="text-[11px] text-slate-400">clinic local time</span>
            </div>
            <div className="rounded-xl ring-1 ring-slate-200 overflow-hidden divide-y divide-slate-100 bg-white">
              {WEEKDAYS.map((day) => {
                const has = rows[day].length > 0;
                return (<div key={day} className={`flex items-center gap-2 px-2.5 py-2 flex-wrap ${has ? "" : "bg-slate-50/70"}`}>
                    <label className="flex items-center gap-1.5 w-[52px] cursor-pointer shrink-0">
                      <input type="checkbox" checked={has} onChange={(e) => toggleDay(day, e.target.checked)} className="accent-teal-600"/>
                      <span className={`text-xs font-semibold ${has ? "text-slate-800" : "text-slate-400"}`}>{DAY_SHORT[day]}</span>
                    </label>
                    {has ? (<div className="flex items-center gap-1.5 flex-wrap">
                        {rows[day].map((w, i) => (<span key={i} className="flex items-center gap-1">
                            <input type="time" className={timeInput} value={w.start} onChange={(e) => updateWindow(day, i, { start: e.target.value })}/>
                            <span className="text-slate-400 text-xs">–</span>
                            <input type="time" className={timeInput} value={w.end} onChange={(e) => updateWindow(day, i, { end: e.target.value })}/>
                            {rows[day].length > 1 && (<button onClick={() => removeWindow(day, i)} title="Remove this window" className="w-5 h-5 rounded-md text-slate-400 hover:text-urgency-high hover:bg-red-50 text-xs leading-none transition-colors">✕</button>)}
                          </span>))}
                        <button onClick={() => addWindow(day)} title="Add a second window (e.g. evening clinic)" className="ml-1 w-6 h-6 rounded-md ring-1 ring-dashed ring-slate-300 text-slate-400 hover:text-primary hover:ring-primary text-sm leading-none font-bold transition-colors">+</button>
                      </div>) : (<span className="text-xs text-slate-400 ml-auto">Not consulting</span>)}
                  </div>);
            })}
            </div>
          </div>

          <button onClick={save} disabled={busy || specialization.trim().length < 2} className={`${btnClass} w-full`}>
            {busy ? "Saving…" : "Save profile"}
          </button>

          {savedMsg && <p className="text-xs text-emerald-700">{savedMsg}</p>}
          {error && <p className="text-xs text-urgency-high">{error}</p>}
        </div>)}
    </Card>);
}
