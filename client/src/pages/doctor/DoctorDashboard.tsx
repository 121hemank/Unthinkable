import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { Appointment, PatientHistoryVisit, PreVisitSummary, PrescriptionItem, SymptomForm, UserRef, } from "../../types";
import { DashboardShell } from "../../components/DashboardShell";
import { Card, Stat, StatusBadge, UrgencyBadge, btnClass, inputClass } from "../../components/ui";
import { CalendarLinkCard } from "../../components/CalendarLinkCard";
import { DoctorProfileCard } from "../../components/DoctorProfileCard";
import { fmtSlot, fmtTime, initials, whenLabel } from "../../lib/format";
function nameOf(ref: string | UserRef): string {
    return ref && typeof ref === "object" ? ref?.name || "Unknown" : "Unknown";
}
const emptyRx: PrescriptionItem = {
    medicationName: "",
    dosage: "",
    frequency: "once daily after dinner",
    durationDays: 5,
};
function PatientHistory({ patientId }: {
    patientId: string;
}) {
    const [visits, setVisits] = useState<PatientHistoryVisit[] | null>(null);
    const [error, setError] = useState(false);
    useEffect(() => {
        api
            .get(`/doctors/patients/${patientId}/history`)
            .then(({ data }) => setVisits(data.visits))
            .catch(() => setError(true));
    }, [patientId]);
    return (<div className="bg-slate-50 rounded-lg p-4">
      <h4 className="text-sm font-semibold text-slate-700 mb-2">Past visits &amp; prescriptions</h4>
      {error ? (<p className="text-sm text-urgency-medium">Could not load patient history.</p>) : visits === null ? (<p className="text-sm text-slate-500">Loading…</p>) : visits.length === 0 ? (<p className="text-sm text-slate-500">First visit — no prior clinic history.</p>) : (<ul className="space-y-2">
          {visits.map((v) => {
                const meds = v.prescription.map((p) => p.medicationName).join(", ");
                return (<li key={v._id} className="flex items-center gap-3 text-sm">
                <span className="text-slate-700 font-medium whitespace-nowrap">{whenLabel(v.slotStart)}</span>
                <span className={`text-xs whitespace-nowrap ${v.status === "COMPLETED" ? "text-emerald-700" : "text-slate-400"}`}>
                  {v.status.toLowerCase()}
                </span>
                <span className="text-slate-600 truncate">
                  {meds || "no prescription recorded"}
                </span>
              </li>);
            })}
        </ul>)}
    </div>);
}
type RowVariant = "attention" | "upcoming";
function AppointmentRow({ appt, variant, onSubmitted, }: {
    appt: Appointment;
    variant: RowVariant;
    onSubmitted: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [brief, setBrief] = useState<{
        symptomForm: SymptomForm | null;
        summary: PreVisitSummary | null;
    } | null>(null);
    const [notes, setNotes] = useState("");
    const [rx, setRx] = useState<PrescriptionItem[]>([{ ...emptyRx }]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    async function toggle() {
        const next = !open;
        setOpen(next);
        if (next && !brief) {
            try {
                const { data } = await api.get(`/doctors/appointments/${appt._id}/pre-visit`);
                setBrief(data);
            }
            catch {
                setBrief({ symptomForm: null, summary: null });
            }
        }
    }
    function updateRx(i: number, patch: Partial<PrescriptionItem>) {
        setRx((prev) => prev.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
    }
    async function submitPostVisit() {
        setBusy(true);
        setError(null);
        try {
            await api.post(`/doctors/appointments/${appt._id}/post-visit`, {
                clinicalNotes: notes,
                prescription: rx.filter((r) => r.medicationName.trim() !== ""),
            });
            onSubmitted();
        }
        catch (err: any) {
            setError(err?.response?.data?.error || "Could not save post-visit notes");
        }
        finally {
            setBusy(false);
        }
    }
    const accent = variant === "attention"
        ? "border-l-4 border-l-amber-400"
        : "";
    return (<div className={`${accent} border border-slate-200 rounded-xl bg-white transition-colors`}>
      <button onClick={toggle} className="w-full text-left px-5 py-4 flex items-center gap-4">
        <div className="w-10 h-10 shrink-0 rounded-full bg-primary-light text-primary-dark flex items-center justify-center text-sm font-semibold">
          {initials(nameOf(appt.patientId))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900 truncate">{nameOf(appt.patientId)}</p>
          <p className="text-sm text-slate-500">{whenLabel(appt.slotStart)}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {variant === "attention" && (<span className="hidden sm:inline-block rounded-full bg-amber-100 text-amber-800 px-2.5 py-0.5 text-xs font-medium">
              Awaiting notes
            </span>)}
          <StatusBadge status={appt.status}/>
          <span className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
        </div>
      </button>

      {open && (<div className="px-5 pb-5 space-y-5 border-t border-slate-100 pt-4">
          
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Patient's symptoms</h4>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                {brief?.symptomForm?.rawSymptoms || "No symptom form submitted."}
              </p>
            </div>
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-slate-700">AI pre-visit summary</h4>
                {brief?.summary?.llmStatus === "OK" && brief.summary.urgencyLevel && (<UrgencyBadge level={brief.summary.urgencyLevel}/>)}
              </div>
              {brief?.summary?.llmStatus === "OK" ? (<>
                  <p className="text-sm text-slate-700 mb-2">
                    <strong>Chief complaint:</strong> {brief.summary.chiefComplaint}
                  </p>
                  <p className="text-sm text-slate-700 font-medium mb-1">Suggested questions:</p>
                  <ul className="list-disc list-inside text-sm text-slate-700">
                    {brief.summary.suggestedQuestions.map((q, i) => (<li key={i}>{q}</li>))}
                  </ul>
                </>) : (<p className="text-sm text-urgency-medium">
                  AI summary unavailable — rely on the raw symptoms above.
                </p>)}
            </div>
          </div>

          
          {typeof appt.patientId !== "string" && (<PatientHistory patientId={appt.patientId._id}/>)}

          
          {variant === "attention" ? (<>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Clinical notes</label>
                <textarea rows={3} className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Diagnosis, observations, advice…"/>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-slate-600">Prescription</label>
                  <button onClick={() => setRx((p) => [...p, { ...emptyRx }])} className="text-sm text-primary font-medium">
                    + Add medication
                  </button>
                </div>
                {rx.map((item, i) => (<div key={i} className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-2">
                    <input className={inputClass} placeholder="Medication" value={item.medicationName} onChange={(e) => updateRx(i, { medicationName: e.target.value })}/>
                    <input className={inputClass} placeholder="Dosage (500mg)" value={item.dosage} onChange={(e) => updateRx(i, { dosage: e.target.value })}/>
                    <input className={inputClass} placeholder='Frequency ("1-0-1" or words)' value={item.frequency} onChange={(e) => updateRx(i, { frequency: e.target.value })}/>
                    <input className={inputClass} type="number" min={1} value={item.durationDays} onChange={(e) => updateRx(i, { durationDays: Number(e.target.value) })}/>
                    <button onClick={() => setRx((p) => p.filter((_, idx) => idx !== i))} className="text-sm text-slate-500 hover:text-urgency-high">
                      Remove
                    </button>
                  </div>))}
              </div>

              {error && <p className="text-sm text-urgency-high">{error}</p>}
              <button onClick={submitPostVisit} disabled={busy || notes.trim().length < 3} className={btnClass}>
                {busy ? "Saving…" : "Complete visit & generate patient summary"}
              </button>
            </>) : (<div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-600">
              Consultation is scheduled for <strong>{whenLabel(appt.slotStart)}</strong>. Clinical
              notes and prescription unlock once the visit time begins — this is enforced on the
              server as well.
            </div>)}
        </div>)}
    </div>);
}
export default function DoctorDashboard() {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const load = useCallback(async () => {
        try {
            const { data } = await api.get("/doctors/appointments/mine");
            setAppointments(data.appointments);
        }
        catch {
        }
        finally {
            setLoaded(true);
        }
    }, []);
    useEffect(() => {
        load();
    }, [load]);
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(t);
    }, []);
    const groups = useMemo(() => {
        const active = appointments.filter((a) => a.status === "CONFIRMED");
        const attention = active
            .filter((a) => new Date(a.slotStart).getTime() <= now)
            .sort((a, b) => +new Date(a.slotStart) - +new Date(b.slotStart));
        const upcoming = active
            .filter((a) => new Date(a.slotStart).getTime() > now)
            .sort((a, b) => +new Date(a.slotStart) - +new Date(b.slotStart));
        const completed = appointments.filter((a) => a.status === "COMPLETED");
        return { attention, upcoming, completed };
    }, [appointments, now]);
    const next = groups.upcoming[0];
    return (<DashboardShell title="Dr. dashboard" subtitle="Your appointments, pre-visit briefs and post-visit notes">
      
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Awaiting notes" value={groups.attention.length} accent="border-amber-400"/>
        <Stat label="Upcoming" value={groups.upcoming.length} accent="border-primary"/>
        <Stat label="Patients seen" value={groups.completed.length} accent="border-emerald-500"/>
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 col-span-2 sm:col-span-1">
          <p className="text-xs uppercase tracking-wide text-slate-500">Next patient</p>
          {next ? (<>
              <p className="font-medium text-slate-900 truncate mt-1">{nameOf(next.patientId)}</p>
              <p className="text-xs text-slate-500">{whenLabel(next.slotStart)}</p>
            </>) : (<p className="text-sm text-slate-400 mt-1">None scheduled</p>)}
        </div>
      </div>

      
      <Card title="Needs your notes" actions={groups.attention.length > 0 ? (<span className="rounded-full bg-amber-100 text-amber-800 px-2.5 py-0.5 text-xs font-medium">
              {groups.attention.length}
            </span>) : undefined}>
        {!loaded ? (<p className="text-sm text-slate-500">Loading…</p>) : groups.attention.length === 0 ? (<p className="text-sm text-slate-500">
            Nothing waiting — visits appear here once their consultation time has passed.
          </p>) : (<div className="space-y-3">
            {groups.attention.map((a) => (<AppointmentRow key={a._id} appt={a} variant="attention" onSubmitted={load}/>))}
          </div>)}
      </Card>

      
      <Card title="Upcoming consultations" actions={groups.upcoming.length > 0 ? (<span className="rounded-full bg-primary-light text-primary-dark px-2.5 py-0.5 text-xs font-medium">
              {groups.upcoming.length}
            </span>) : undefined}>
        {!loaded ? (<p className="text-sm text-slate-500">Loading…</p>) : groups.upcoming.length === 0 ? (<p className="text-sm text-slate-500">
            No upcoming appointments yet. Patients will appear here once they book you.
          </p>) : (<div className="space-y-3">
            {groups.upcoming.map((a) => (<AppointmentRow key={a._id} appt={a} variant="upcoming" onSubmitted={load}/>))}
          </div>)}
      </Card>

      
      <Card title="Recent history">
        {groups.completed.length === 0 ? (<p className="text-sm text-slate-500">Completed visits will be listed here.</p>) : (<ul className="divide-y divide-slate-100">
            {groups.completed.slice(0, 6).map((a) => (<li key={a._id} className="py-3 flex items-center gap-4">
                <div className="w-9 h-9 shrink-0 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-semibold">
                  {initials(nameOf(a.patientId))}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{nameOf(a.patientId)}</p>
                  <p className="text-xs text-slate-500">{whenLabel(a.slotStart)}</p>
                </div>
                <StatusBadge status={a.status}/>
              </li>))}
          </ul>)}
      </Card>

      <DoctorProfileCard />
      <CalendarLinkCard />
    </DashboardShell>);
}
