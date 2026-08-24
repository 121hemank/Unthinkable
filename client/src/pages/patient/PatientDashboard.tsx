import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { Appointment, DoctorListItem, PostVisitNoteT, PostVisitSummaryT, Slot, UserRef, } from "../../types";
import { DashboardShell } from "../../components/DashboardShell";
import { Avatar, Card, Stat, StatusBadge, btnClass, inputClass } from "../../components/ui";
import { fmtSlot, fmtTime, whenLabel } from "../../lib/format";
import { CalendarLinkCard } from "../../components/CalendarLinkCard";
import { NotificationBell } from "../../components/NotificationBell";
function nameOf(ref: string | UserRef): string {
    return ref && typeof ref === "object" ? ref?.name || "Unknown" : "Unknown";
}
interface VisitRecord {
    symptomForm: {
        rawSymptoms: string;
    } | null;
    postVisitNote: PostVisitNoteT | null;
    postVisitSummary: PostVisitSummaryT | null;
}
function VisitSummaryPanel({ apptId }: {
    apptId: string;
}) {
    const [record, setRecord] = useState<VisitRecord | null>(null);
    const [error, setError] = useState(false);
    useEffect(() => {
        api
            .get(`/appointments/${apptId}/summary`)
            .then(({ data }) => setRecord(data))
            .catch(() => setError(true));
    }, [apptId]);
    if (error)
        return <p className="text-sm text-urgency-high">Could not load visit summary.</p>;
    if (!record)
        return <p className="text-sm text-slate-500">Loading…</p>;
    const s = record.postVisitSummary;
    const rx = record.postVisitNote?.prescription ?? [];
    return (<div className="mt-4 space-y-5">
      
      {s?.llmStatus === "OK" && s.patientFriendlyText ? (<div className="bg-primary-light/40 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-primary-dark mb-1.5">Your visit summary</h4>
          <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{s.patientFriendlyText}</p>
          {s.followUpSteps && (<>
              <h4 className="text-sm font-semibold text-primary-dark mt-4 mb-1.5">Next steps</h4>
              <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{s.followUpSteps}</p>
            </>)}
        </div>) : (<div className="bg-amber-50 rounded-xl p-5 border border-amber-100">
          <h4 className="text-sm font-semibold text-urgency-medium mb-1.5">
            Visit summary
            <span className="ml-2 text-xs font-normal">(AI summary unavailable — showing doctor's original notes)</span>
          </h4>
          <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
            {record.postVisitNote?.clinicalNotes || "Notes not yet added."}
          </p>
        </div>)}

      
      {s?.llmStatus === "OK" && s.medicationSchedule.length > 0 && (<div>
          <h4 className="text-sm font-semibold text-slate-700 mb-2">When to take your medicines</h4>
          <div className="grid sm:grid-cols-2 gap-2">
            {s.medicationSchedule.map((m, i) => (<div key={i} className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm">
                <span className="font-medium text-slate-900">{m.medicationName}</span>
                <span className="font-mono text-xs text-primary-dark bg-primary-light/60 rounded-full px-2 py-0.5 whitespace-nowrap">
                  {m.timeOfDay.join(" · ")}
                </span>
              </div>))}
          </div>
        </div>)}

      
      {rx.length > 0 && (<div>
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Prescription</h4>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 bg-slate-50">
                  <th className="py-2 px-4 font-medium">Medicine</th>
                  <th className="py-2 px-4 font-medium">Dosage</th>
                  <th className="py-2 px-4 font-medium">Frequency</th>
                  <th className="py-2 px-4 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {rx.map((item, i) => (<tr key={i} className="border-t border-slate-100">
                    <td className="py-2 px-4 font-medium text-slate-900">{item.medicationName}</td>
                    <td className="py-2 px-4">{item.dosage}</td>
                    <td className="py-2 px-4 text-slate-600">{item.frequency}</td>
                    <td className="py-2 px-4">{item.durationDays} days</td>
                  </tr>))}
              </tbody>
            </table>
          </div>
        </div>)}

      
      {record.symptomForm && (<div>
          <h4 className="text-sm font-semibold text-slate-700 mb-1">Symptoms you reported</h4>
          <p className="text-sm text-slate-600 whitespace-pre-wrap bg-slate-50 rounded-lg p-3.5 leading-relaxed">
            {record.symptomForm.rawSymptoms}
          </p>
        </div>)}
    </div>);
}
type Step = "search" | "slots" | "booking";
const STEPS: {
    label: string;
    caption: string;
}[] = [
    { label: "Find a doctor", caption: "Search by specialty" },
    { label: "Pick a time", caption: "Choose a free slot" },
    { label: "Confirm", caption: "Describe your symptoms" },
];
function Stepper({ current }: {
    current: number;
}) {
    return (<div className="flex items-center mb-6">
      {STEPS.map((s, i) => (<Fragment key={s.label}>
          {i > 0 && (<div className={`h-0.5 flex-1 mx-3 ${i <= current ? "bg-primary" : "bg-slate-200"}`}/>)}
          <div className="flex items-center gap-2.5 shrink-0">
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${i < current
                ? "bg-emerald-500 text-white"
                : i === current
                    ? "bg-primary text-white"
                    : "bg-slate-100 text-slate-400"}`}>
              {i < current ? "✓" : i + 1}
            </span>
            <div className="hidden sm:block leading-tight">
              <p className={`text-sm font-medium ${i === current ? "text-slate-900" : "text-slate-400"}`}>
                {s.label}
              </p>
              <p className="text-[11px] text-slate-400 hidden md:block">{s.caption}</p>
            </div>
          </div>
        </Fragment>))}
    </div>);
}
const BOOKING_WINDOW_DAYS = 90;
const nextDays = (n: number): string[] => Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
});
const TODAY = () => nextDays(1)[0];
const LAST_BOOKABLE_DAY = () => nextDays(BOOKING_WINDOW_DAYS)[BOOKING_WINDOW_DAYS - 1];
function DateField({ value, onChange }: {
    value: string;
    onChange: (d: string) => void;
}) {
    return (<div>
      <label className="block text-sm text-slate-600 mb-1">Appointment date</label>
      <input type="date" className={inputClass} value={value} min={TODAY()} max={LAST_BOOKABLE_DAY()} onChange={(e) => e.target.value && onChange(e.target.value)}/>
      <p className="text-xs text-slate-400 mt-1">Bookable up to {BOOKING_WINDOW_DAYS} days ahead</p>
    </div>);
}
function DayChips({ selected, onPick }: {
    selected: string;
    onPick: (d: string) => void;
}) {
    return (<div className="flex gap-2 mt-3 flex-wrap">
      {nextDays(7).map((d) => {
            const active = d === selected;
            const dt = new Date(`${d}T00:00:00Z`);
            return (<button key={d} onClick={() => onPick(d)} className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${active
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-white text-slate-600 border-slate-300 hover:border-primary hover:text-primary"}`}>
            <span className="block text-[11px] opacity-75 leading-none mb-0.5">
              {dt.toLocaleDateString(undefined, { timeZone: "UTC", weekday: "short" })}
            </span>
            {dt.toLocaleDateString(undefined, { timeZone: "UTC", day: "numeric", month: "short" })}
          </button>);
        })}
    </div>);
}
function SlotGrid({ slots, busy, cols = "grid-cols-3 sm:grid-cols-5", onPick, }: {
    slots: Slot[];
    busy: boolean;
    cols?: string;
    onPick: (s: Slot) => void;
}) {
    return (<div className={`grid ${cols} gap-2`}>
      {slots.map((s) => (<button key={s.slotStart} disabled={busy} onClick={() => onPick(s)} className="border border-slate-300 rounded-lg py-2 text-sm font-medium text-slate-700 transition-colors
                     hover:border-primary hover:bg-primary-light hover:text-primary-dark
                     disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-slate-700">
          {fmtTime(s.slotStart)}
        </button>))}
    </div>);
}
function HoldCountdown({ expiresAt, onExpired }: {
    expiresAt: string;
    onExpired: () => void;
}) {
    const [remaining, setRemaining] = useState(() => Date.parse(expiresAt) - Date.now());
    const fired = useRef(false);
    useEffect(() => {
        const t = setInterval(() => {
            const left = Date.parse(expiresAt) - Date.now();
            setRemaining(left);
            if (left <= 0 && !fired.current) {
                fired.current = true;
                onExpired();
            }
        }, 1000);
        return () => clearInterval(t);
    }, [expiresAt, onExpired]);
    const mins = Math.max(0, Math.floor(remaining / 60000));
    const secs = Math.max(0, Math.floor((remaining % 60000) / 1000));
    return (<span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-mono ${remaining < 60000 ? "bg-red-50 text-urgency-high" : "bg-amber-50 text-amber-700"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${remaining < 60000 ? "bg-red-500" : "bg-amber-500"} animate-pulse`}/>
      Slot held · {mins}:{String(secs).padStart(2, "0")}
    </span>);
}
function UpcomingRow({ appt, variant, onReschedule, onResume, onRelease, onCancel, }: {
    appt: Appointment;
    variant: "confirmed" | "held";
    onReschedule: () => void;
    onResume: () => void;
    onRelease: () => void;
    onCancel: () => void;
}) {
    return (<div className={`border border-slate-200 rounded-xl bg-white overflow-hidden ${variant === "held" ? "border-l-4 border-l-amber-400" : ""}`}>
      <div className="px-5 py-4 flex items-center gap-4">
        <Avatar name={nameOf(appt.doctorId)}/>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900 truncate">Dr. {nameOf(appt.doctorId)}</p>
          <p className="text-sm text-slate-500">{whenLabel(appt.slotStart)}</p>
        </div>
        <StatusBadge status={appt.status}/>
        <div className="flex items-center gap-3 whitespace-nowrap">
          {variant === "held" ? (<>
              <button onClick={onResume} className="text-sm font-semibold text-primary hover:underline">
                Complete booking →
              </button>
              <button onClick={onRelease} className="text-sm text-slate-500 hover:text-slate-800 hover:underline">
                Release slot
              </button>
            </>) : (<>
              <button onClick={onReschedule} className="text-sm text-primary font-medium hover:underline">
                Reschedule
              </button>
              <button onClick={onCancel} className="text-sm text-urgency-medium hover:underline">
                Cancel
              </button>
            </>)}
        </div>
      </div>
    </div>);
}
export default function PatientDashboard() {
    const [step, setStep] = useState<Step>("search");
    const [message, setMessage] = useState<{
        text: string;
        ok: boolean;
    } | null>(null);
    const [specialization, setSpecialization] = useState("");
    const [doctors, setDoctors] = useState<DoctorListItem[]>([]);
    const [searching, setSearching] = useState(false);
    const [doctor, setDoctor] = useState<DoctorListItem | null>(null);
    const [date, setDate] = useState(nextDays(7)[0]);
    const [slots, setSlots] = useState<Slot[]>([]);
    const [slotReason, setSlotReason] = useState<string | null>(null);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [held, setHeld] = useState<Appointment | null>(null);
    const [symptoms, setSymptoms] = useState("");
    const [symptomsSaved, setSymptomsSaved] = useState(false);
    const [busy, setBusy] = useState(false);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
    const [rsDate, setRsDate] = useState(nextDays(7)[1]);
    const [rsSlots, setRsSlots] = useState<Slot[]>([]);
    const [rsReason, setRsReason] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);
    const loadAppointments = useCallback(async () => {
        try {
            const { data } = await api.get("/appointments/mine");
            setAppointments(data.appointments);
        }
        catch {
        }
    }, []);
    useEffect(() => {
        loadAppointments();
    }, [loadAppointments]);
    useEffect(() => {
        api
            .get("/doctors")
            .then(({ data }) => setDoctors(data.doctors))
            .catch(() => { });
    }, []);
    async function search() {
        setSearching(true);
        setMessage(null);
        try {
            const { data } = await api.get("/doctors", {
                params: specialization ? { specialization } : {},
            });
            setDoctors(data.doctors);
        }
        catch (err: any) {
            setMessage({ text: err?.response?.data?.error || "Search failed", ok: false });
        }
        finally {
            setSearching(false);
        }
    }
    async function pickDoctor(d: DoctorListItem) {
        setDoctor(d);
        setStep("slots");
        setMessage(null);
    }
    const loadSlots = useCallback(async (doctorId: string, d: string) => {
        setLoadingSlots(true);
        setSlotReason(null);
        try {
            const { data } = await api.get("/appointments/available-slots", {
                params: { doctorId, date: d },
            });
            setSlots(data.slots);
            setSlotReason(data.reason || null);
        }
        catch (err: any) {
            setMessage({ text: err?.response?.data?.error || "Could not load slots", ok: false });
        }
        finally {
            setLoadingSlots(false);
        }
    }, []);
    useEffect(() => {
        if (step === "slots" && doctor)
            loadSlots(doctor._id, date);
    }, [step, doctor, date, loadSlots]);
    async function pickSlot(slot: Slot) {
        if (!doctor)
            return;
        setBusy(true);
        setMessage(null);
        try {
            const { data } = await api.post("/appointments/hold", {
                doctorId: doctor._id,
                slotStart: slot.slotStart,
                slotEnd: slot.slotEnd,
            });
            setHeld(data.appointment);
            setSymptoms("");
            setSymptomsSaved(false);
            setStep("booking");
        }
        catch (err: any) {
            const msg = err?.response?.status === 409
                ? "That slot was just taken — pick another."
                : err?.response?.data?.error || "Could not hold that slot";
            setMessage({ text: msg, ok: false });
            loadSlots(doctor._id, date);
        }
        finally {
            setBusy(false);
        }
    }
    async function saveSymptoms() {
        if (!held)
            return;
        setBusy(true);
        try {
            await api.post(`/appointments/${held._id}/symptoms`, { symptoms }, { timeout: 70000 });
            setSymptomsSaved(true);
            setMessage({ text: "Symptoms saved.", ok: true });
        }
        catch (err: any) {
            setMessage({ text: err?.response?.data?.error || "Could not save symptoms", ok: false });
        }
        finally {
            setBusy(false);
        }
    }
    async function confirm() {
        if (!held)
            return;
        setBusy(true);
        try {
            await api.post(`/appointments/${held._id}/confirm`);
            setMessage({ text: "Appointment confirmed! Check your email for details.", ok: true });
            setStep("search");
            setDoctor(null);
            setHeld(null);
            loadAppointments();
        }
        catch (err: any) {
            setMessage({ text: err?.response?.data?.error || "Confirm failed", ok: false });
            if (err?.response?.status === 410) {
                setHeld(null);
                setStep("slots");
            }
        }
        finally {
            setBusy(false);
        }
    }
    function releaseHold() {
        if (held)
            api.post(`/appointments/${held._id}/cancel`).catch(() => { });
        setHeld(null);
        setStep(doctor ? "slots" : "search");
        loadAppointments();
    }
    function resumeHold(a: Appointment) {
        const expiry = a.holdExpiresAt ? Date.parse(a.holdExpiresAt) : 0;
        if (expiry <= Date.now()) {
            api.post(`/appointments/${a._id}/cancel`).catch(() => { });
            setMessage({ text: "That hold had already expired — the slot is free for anyone now.", ok: false });
            loadAppointments();
            return;
        }
        setDoctor(null);
        setHeld(a);
        setSymptoms("");
        setSymptomsSaved(false);
        setStep("booking");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
    async function cancelAppointment(id: string) {
        try {
            await api.post(`/appointments/${id}/cancel`);
            loadAppointments();
        }
        catch (err: any) {
            setMessage({ text: err?.response?.data?.error || "Cancel failed", ok: false });
        }
    }
    function startReschedule(a: Appointment) {
        setRescheduling(a);
        setRsDate(nextDays(7)[1]);
        setMessage(null);
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }
    const doctorIdOf = (a: Appointment) => (typeof a.doctorId === "string" ? a.doctorId : a.doctorId?._id ?? "");
    useEffect(() => {
        if (!rescheduling)
            return;
        setLoadingSlots(true);
        api
            .get("/appointments/available-slots", {
            params: { doctorId: doctorIdOf(rescheduling), date: rsDate },
        })
            .then(({ data }) => {
            setRsSlots(data.slots);
            setRsReason(data.reason || null);
        })
            .catch(() => setRsSlots([]))
            .finally(() => setLoadingSlots(false));
    }, [rescheduling, rsDate]);
    async function pickRescheduleSlot(slot: Slot) {
        if (!rescheduling)
            return;
        setBusy(true);
        try {
            await api.post(`/appointments/${rescheduling._id}/reschedule`, {
                slotStart: slot.slotStart,
                slotEnd: slot.slotEnd,
            });
            setMessage({ text: "Appointment rescheduled — both parties notified.", ok: true });
            setRescheduling(null);
            loadAppointments();
        }
        catch (err: any) {
            setMessage({
                text: err?.response?.status === 409
                    ? "That slot was just taken — pick another."
                    : err?.response?.data?.error || "Reschedule failed",
                ok: false,
            });
        }
        finally {
            setBusy(false);
        }
    }
    const [nowTick, setNowTick] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setNowTick(Date.now()), 30000);
        return () => clearInterval(t);
    }, []);
    const groups = useMemo(() => {
        const upcoming = appointments.filter((a) => a.status === "CONFIRMED" ||
            (a.status === "HELD" &&
                (!a.holdExpiresAt || Date.parse(a.holdExpiresAt) > nowTick)));
        const completed = appointments.filter((a) => a.status === "COMPLETED");
        const cancelled = appointments.filter((a) => a.status === "CANCELLED");
        return { upcoming, completed, cancelled };
    }, [appointments, nowTick]);
    const nextAppt = [...groups.upcoming].sort((a, b) => +new Date(a.slotStart) - +new Date(b.slotStart))[0];
    const stepIndex = step === "search" ? 0 : step === "slots" ? 1 : 2;
    return (<DashboardShell title="Patient Portal" subtitle="Find a doctor and book an appointment" headerRight={<NotificationBell />}>
      {message && (<div className={`rounded-xl px-4 py-3 text-sm border ${message.ok
                ? "bg-emerald-50 text-emerald-800 border-emerald-100"
                : "bg-red-50 text-urgency-high border-red-100"}`}>
          {message.text}
        </div>)}

      
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Upcoming visits" value={groups.upcoming.length} accent="border-primary"/>
        <Stat label="Visits completed" value={groups.completed.length} accent="border-emerald-500"/>
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 col-span-2 sm:col-span-1">
          <p className="text-xs uppercase tracking-wide text-slate-500">Next appointment</p>
          {nextAppt ? (<>
              <p className="font-medium text-slate-900 truncate mt-1">
                Dr. {nameOf(nextAppt.doctorId)}
              </p>
              <p className="text-xs text-slate-500">{whenLabel(nextAppt.slotStart)}</p>
            </>) : (<p className="text-sm text-slate-400 mt-1">None scheduled</p>)}
        </div>
      </div>

      
      <Card title="Book an appointment">
        <Stepper current={stepIndex}/>

        {step === "search" && (<>
            <div className="flex gap-2 mb-5">
              <input className={inputClass} placeholder="Search by specialization (e.g. Cardiology) or leave blank for all" value={specialization} onChange={(e) => setSpecialization(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()}/>
              <button onClick={search} disabled={searching} className={btnClass}>
                {searching ? "Searching…" : "Search"}
              </button>
            </div>
            {doctors.length === 0 ? (<p className="text-sm text-slate-500">No doctors to show yet — run a search above.</p>) : (<ul className="divide-y divide-slate-100 -mx-2">
                {doctors.map((d) => (<li key={d._id} className="py-3 px-2 flex items-center gap-4">
                    <Avatar name={d.name} tone="emerald"/>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 truncate">Dr. {d.name}</p>
                      <p className="text-sm text-slate-500">
                        {d.specialization || "General practice"} · {d.slotDurationMinutes || 30} min slots
                      </p>
                    </div>
                    <button onClick={() => pickDoctor(d)} className={btnClass}>
                      Book
                    </button>
                  </li>))}
              </ul>)}
          </>)}

        {step === "slots" && doctor && (<>
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="flex items-center gap-3">
                <Avatar name={doctor.name} tone="emerald"/>
                <div>
                  <h2 className="font-semibold text-slate-900 leading-tight">Dr. {doctor.name}</h2>
                  <p className="text-sm text-slate-500">
                    Pick a date &amp; time · {doctor.specialization || "General practice"}
                  </p>
                </div>
              </div>
              <button onClick={() => setStep("search")} className="text-sm text-primary font-medium hover:underline whitespace-nowrap">
                ← Change doctor
              </button>
            </div>
            <div className="mb-5">
              <DateField value={date} onChange={setDate}/>
              <DayChips selected={date} onPick={setDate}/>
            </div>
            {loadingSlots ? (<p className="text-sm text-slate-500">Loading slots…</p>) : slots.length === 0 ? (<div className="bg-slate-50 rounded-xl px-4 py-6 text-center">
                <p className="text-sm text-slate-500">{slotReason || "No available slots on this day."}</p>
                <p className="text-xs text-slate-400 mt-1">Try another date from the chips above.</p>
              </div>) : (<SlotGrid slots={slots} busy={busy} onPick={pickSlot}/>)}
          </>)}

        {step === "booking" && held && (<>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <h2 className="text-lg font-semibold text-slate-900">Confirm your appointment</h2>
              <HoldCountdown expiresAt={held.holdExpiresAt!} onExpired={() => {
                setHeld(null);
                setStep(doctor ? "slots" : "search");
                setMessage({ text: "Your 5-minute hold expired — please pick a slot again.", ok: false });
                loadAppointments();
            }}/>
            </div>

            <div className="flex items-center gap-4 bg-primary-light/40 rounded-xl px-5 py-4 mb-5">
              <Avatar name={nameOf(held.doctorId)}/>
              <div>
                <p className="font-semibold text-slate-900">Dr. {nameOf(held.doctorId)}</p>
                <p className="text-sm text-slate-600">{fmtSlot(held.slotStart)} (IST)</p>
              </div>
            </div>

            <label className="block text-sm text-slate-600 mb-1">
              Describe your symptoms <span className="text-slate-400">(shown to your doctor before the visit)</span>
            </label>
            <textarea rows={4} className={`${inputClass} mb-3`} value={symptoms} onChange={(e) => {
                setSymptoms(e.target.value);
                setSymptomsSaved(false);
            }} placeholder="e.g. Persistent headache for 3 days, worse in the morning, with light sensitivity…"/>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={saveSymptoms} disabled={busy || symptoms.trim().length < 3} className={btnClass}>
                {symptomsSaved ? "Symptoms saved ✓" : "Save symptoms"}
              </button>
              <button onClick={confirm} disabled={busy || !symptomsSaved} className={btnClass}>
                Confirm booking
              </button>
              <button onClick={releaseHold} className="text-sm text-slate-500 hover:text-slate-800 px-3 py-2">
                Pick a different slot
              </button>
            </div>
            {!symptomsSaved && (<p className="text-xs text-slate-400 mt-2">Save your symptoms first, then confirm.</p>)}
          </>)}
      </Card>

      
      <Card title="Upcoming appointments" actions={groups.upcoming.length > 0 ? (<span className="rounded-full bg-primary-light text-primary-dark px-2.5 py-0.5 text-xs font-medium">
              {groups.upcoming.length}
            </span>) : undefined}>
        {groups.upcoming.length === 0 ? (<p className="text-sm text-slate-500">
            Nothing scheduled right now — book your next visit above.
          </p>) : (<div className="space-y-3">
            {groups.upcoming.map((a) => (<UpcomingRow key={a._id} appt={a} variant={a.status === "HELD" ? "held" : "confirmed"} onReschedule={() => startReschedule(a)} onResume={() => resumeHold(a)} onRelease={() => cancelAppointment(a._id)} onCancel={() => cancelAppointment(a._id)}/>))}
          </div>)}
      </Card>

      <Card title="Visit history & summaries">
        {groups.completed.length === 0 && groups.cancelled.length === 0 ? (<p className="text-sm text-slate-500">Completed and cancelled visits will be listed here.</p>) : (<ul className="divide-y divide-slate-100 -mx-2">
            {[...groups.completed, ...groups.cancelled].map((a) => (<li key={a._id}>
                <div className="py-3 px-2 flex items-center gap-4">
                  <Avatar name={nameOf(a.doctorId)} tone={a.status === "COMPLETED" ? "emerald" : "slate"} size="sm"/>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">Dr. {nameOf(a.doctorId)}</p>
                    <p className="text-xs text-slate-500">{whenLabel(a.slotStart)}</p>
                  </div>
                  <StatusBadge status={a.status}/>
                  {a.status === "COMPLETED" && (<button onClick={() => setExpanded(a._id === expanded ? null : a._id)} className="text-sm text-primary font-medium hover:underline whitespace-nowrap">
                      {expanded === a._id ? "Hide summary ↑" : "View summary"}
                    </button>)}
                </div>
                {expanded === a._id && (<div className="px-2 pb-5">
                    <VisitSummaryPanel apptId={a._id}/>
                  </div>)}
              </li>))}
          </ul>)}

        
        {rescheduling && (<div className="mt-5 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-slate-900">
                Reschedule: Dr. {nameOf(rescheduling.doctorId)} · currently{" "}
                <span className="text-slate-500">{fmtSlot(rescheduling.slotStart)}</span>
              </h3>
              <button onClick={() => setRescheduling(null)} className="text-sm text-slate-500 hover:text-slate-800">
                Close
              </button>
            </div>
            <div className="mb-4">
              <DateField value={rsDate} onChange={setRsDate}/>
              <DayChips selected={rsDate} onPick={setRsDate}/>
            </div>
            {loadingSlots ? (<p className="text-sm text-slate-500">Loading slots…</p>) : rsSlots.length === 0 ? (<div className="bg-slate-50 rounded-xl px-4 py-6 text-center">
                <p className="text-sm text-slate-500">{rsReason || "No available slots on this day."}</p>
                <p className="text-xs text-slate-400 mt-1">Try another date from the chips above.</p>
              </div>) : (<SlotGrid slots={rsSlots} busy={busy} cols="grid-cols-4 sm:grid-cols-6" onPick={pickRescheduleSlot}/>)}
          </div>)}
      </Card>

      
      <CalendarLinkCard />
    </DashboardShell>);
}
