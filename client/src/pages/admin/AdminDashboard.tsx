import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { AdminUserT, DoctorListItem, UserRef, WeekdayKey } from "../../types";
import { DashboardShell } from "../../components/DashboardShell";
import { Avatar, Card, Stat, StatusBadge, btnClass, inputClass } from "../../components/ui";
import { whenLabel } from "../../lib/format";
const WEEKDAYS: WeekdayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS: Record<WeekdayKey, string> = {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
};
interface PlatformStats {
    patients: number;
    doctors: number;
    byStatus: Record<string, number>;
    todayConfirmed: number;
}
interface LeaveEntry {
    _id: string;
    doctorId: string | UserRef;
    date: string;
    reason?: string;
}
function nameOf(ref: string | UserRef | null | undefined): string {
    return ref && typeof ref === "object" ? ref?.name || "Unknown" : "Unknown";
}
function leaveDateLabel(date: string): string {
    const d = new Date(`${date}T00:00:00`);
    const today = new Date();
    const dayNumber = (x: Date) => Math.floor(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 86400000);
    const diff = dayNumber(d) - dayNumber(today);
    if (diff === 0)
        return "Today";
    if (diff === 1)
        return "Tomorrow";
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function parseHours(input: string): {
    start: string;
    end: string;
}[] {
    return input
        .split(",")
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .map((chunk) => {
        const [start, end] = chunk.split("-").map((s) => s.trim());
        return /^\d{1,2}:\d{2}$/.test(start || "") && /^\d{1,2}:\d{2}$/.test(end || "")
            ? { start, end }
            : null;
    })
        .filter(Boolean) as {
        start: string;
        end: string;
    }[];
}
function hoursToText(hours: Record<string, {
    start: string;
    end: string;
}[]> | undefined): string {
    if (!hours)
        return "";
    return WEEKDAYS.map((d) => {
        const slots = hours[d] || [];
        return slots.length ? `${d}: ${slots.map((s) => `${s.start}-${s.end}`).join(", ")}` : "";
    })
        .filter(Boolean)
        .join("\n");
}
function WeeklySchedule({ doctor }: {
    doctor: DoctorListItem;
}) {
    const hours = doctor.profile?.workingHours;
    if (!hours)
        return null;
    return (<div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mt-3 mb-1">
      {WEEKDAYS.map((d) => {
            const windows = hours[d] || [];
            const off = windows.length === 0;
            return (<div key={d} className={`rounded-lg border px-2.5 py-2 ${off ? "border-slate-100 bg-slate-50" : "border-primary/20 bg-primary-light/30"}`}>
            <p className={`text-xs font-semibold ${off ? "text-slate-400" : "text-primary-dark"}`}>
              {DAY_LABELS[d]}
            </p>
            {off ? (<p className="text-[11px] text-slate-400 mt-0.5">Day off</p>) : (<div className="mt-0.5 space-y-0.5">
                {windows.map((w, i) => (<p key={i} className="text-[11px] text-slate-600 font-mono leading-tight">
                    {w.start}–{w.end}
                  </p>))}
              </div>)}
          </div>);
        })}
    </div>);
}
export default function AdminDashboard() {
    const [doctors, setDoctors] = useState<DoctorListItem[]>([]);
    const [stats, setStats] = useState<PlatformStats | null>(null);
    const [allAppts, setAllAppts] = useState<import("../../types").Appointment[]>([]);
    const [apptFilter, setApptFilter] = useState<string>("ALL");
    const [leaves, setLeaves] = useState<LeaveEntry[]>([]);
    const [users, setUsers] = useState<AdminUserT[]>([]);
    const [userFilter, setUserFilter] = useState<string>("ALL");
    const [message, setMessage] = useState<{
        text: string;
        ok: boolean;
    } | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [selectedUserId, setSelectedUserId] = useState("");
    const [specialization, setSpecialization] = useState("");
    const [slotDuration, setSlotDuration] = useState(30);
    const [hoursText, setHoursText] = useState("mon: 09:00-13:00\ntue: 09:00-13:00\nwed: \nthu: 09:00-13:00\nfri: 09:00-13:00\nsat: \nsun: ");
    const [leaveDoctorId, setLeaveDoctorId] = useState("");
    const [leaveDate, setLeaveDate] = useState("");
    const [leaveReason, setLeaveReason] = useState("");
    const [busy, setBusy] = useState(false);
    const leaveCardRef = useRef<HTMLDivElement>(null);
    const load = useCallback(async () => {
        try {
            const [docRes, statsRes, apptRes, leaveRes, usersRes] = await Promise.allSettled([
                api.get("/admin/doctors"),
                api.get("/admin/stats"),
                api.get("/admin/appointments", { params: { limit: 50 } }),
                api.get("/admin/leaves"),
                api.get("/admin/users"),
            ]);
            if (docRes.status === "fulfilled")
                setDoctors(docRes.value.data.doctors);
            if (statsRes.status === "fulfilled")
                setStats(statsRes.value.data);
            if (apptRes.status === "fulfilled")
                setAllAppts(apptRes.value.data.appointments);
            if (leaveRes.status === "fulfilled")
                setLeaves(leaveRes.value.data.leaves);
            if (usersRes.status === "fulfilled")
                setUsers(usersRes.value.data.users);
            if (docRes.status === "rejected") {
                setMessage({ text: docRes.reason?.response?.data?.error || "Could not load doctors", ok: false });
            }
            if (!selectedUserId && docRes.status === "fulfilled" && docRes.value.data.doctors.length) {
                setSelectedUserId(docRes.value.data.doctors[0]._id);
            }
            if (!leaveDoctorId && docRes.status === "fulfilled" && docRes.value.data.doctors.length) {
                setLeaveDoctorId(docRes.value.data.doctors[0]._id);
            }
        }
        catch (err: any) {
            setMessage({ text: err?.response?.data?.error || "Could not load admin data", ok: false });
        }
    }, []);
    useEffect(() => {
        load();
    }, [load]);
    async function createProfile() {
        setBusy(true);
        setMessage(null);
        try {
            const workingHours: Record<string, {
                start: string;
                end: string;
            }[]> = {};
            for (const line of hoursText.split("\n")) {
                const [dayPart, rangePart] = line.split(":").map((s) => s.trim().toLowerCase());
                if (!WEEKDAYS.includes(dayPart as WeekdayKey))
                    continue;
                const range = line.slice(line.indexOf(":") + 1).trim();
                workingHours[dayPart as WeekdayKey] = parseHours(range);
            }
            await api.post("/admin/doctors", {
                userId: selectedUserId,
                specialization,
                slotDurationMinutes: slotDuration,
                workingHours,
            });
            setMessage({ text: "Doctor profile created.", ok: true });
            load();
        }
        catch (err: any) {
            setMessage({ text: err?.response?.data?.error || "Could not create profile", ok: false });
        }
        finally {
            setBusy(false);
        }
    }
    async function markLeave() {
        setBusy(true);
        setMessage(null);
        try {
            const { data } = await api.post("/admin/leave", {
                doctorId: leaveDoctorId,
                date: leaveDate,
                reason: leaveReason || undefined,
            });
            setMessage({
                text: data.cancelledCount > 0
                    ? `Leave saved. ${data.cancelledCount} existing appointment(s) were cancelled and the patients notified.`
                    : "Leave saved. No existing appointments were affected.",
                ok: true,
            });
        }
        catch (err: any) {
            setMessage({ text: err?.response?.data?.error || "Could not mark leave", ok: false });
        }
        finally {
            setBusy(false);
        }
    }
    const unprofiled = doctors.filter((d) => !d.profile);
    const activeProfiles = doctors.length - unprofiled.length;
    async function toggleActive(d: DoctorListItem) {
        if (!d.profile)
            return;
        setBusy(true);
        setMessage(null);
        try {
            const { data } = await api.patch(`/admin/doctors/${d._id}/active`, {
                isActive: !d.profile.isActive,
            });
            setMessage({
                text: `Dr. ${d.name} is now ${data.profile.isActive ? "accepting appointments" : "paused — hidden from patient search & booking"}.`,
                ok: true,
            });
            load();
        }
        catch (err: any) {
            setMessage({ text: err?.response?.data?.error || "Could not update doctor", ok: false });
        }
        finally {
            setBusy(false);
        }
    }
    async function adminCancel(id: string) {
        setBusy(true);
        setMessage(null);
        try {
            await api.post(`/admin/appointments/${id}/cancel`);
            setMessage({ text: "Appointment cancelled — both parties notified.", ok: true });
            load();
        }
        catch (err: any) {
            setMessage({ text: err?.response?.data?.error || "Could not cancel appointment", ok: false });
        }
        finally {
            setBusy(false);
        }
    }
    async function removeLeave(id: string) {
        setBusy(true);
        setMessage(null);
        try {
            await api.delete(`/admin/leaves/${id}`);
            setMessage({ text: "Leave day removed — the doctor is bookable on that date again. Already-cancelled appointments are not restored.", ok: true });
            load();
        }
        catch (err: any) {
            setMessage({ text: err?.response?.data?.error || "Could not remove leave", ok: false });
        }
        finally {
            setBusy(false);
        }
    }
    const filteredAppts = apptFilter === "ALL" ? allAppts : allAppts.filter((a) => a.status === apptFilter);
    const filteredUsers = userFilter === "ALL" ? users : users.filter((u) => u.role === userFilter);
    async function toggleUser(u: AdminUserT) {
        setBusy(true);
        setMessage(null);
        try {
            await api.patch(`/admin/users/${u._id}/active`, { isActive: !u.isActive });
            setMessage({
                text: `${u.name}'s account ${u.isActive ? "disabled — their sessions are revoked instantly" : "re-enabled"}.`,
                ok: true,
            });
            load();
        }
        catch (err: any) {
            setMessage({ text: err?.response?.data?.error || "Could not update account", ok: false });
        }
        finally {
            setBusy(false);
        }
    }
    async function changeRole(u: AdminUserT, role: "patient" | "doctor") {
        setBusy(true);
        setMessage(null);
        try {
            await api.patch(`/admin/users/${u._id}/role`, { role });
            setMessage({
                text: role === "doctor"
                    ? `${u.name} is now a doctor — create their profile in the Doctor roster section.`
                    : `${u.name} is now a patient.`,
                ok: true,
            });
            load();
        }
        catch (err: any) {
            setMessage({ text: err?.response?.data?.error || "Could not change role", ok: false });
        }
        finally {
            setBusy(false);
        }
    }
    function startLeaveFor(d: DoctorListItem) {
        setLeaveDoctorId(d._id);
        setLeaveDate("");
        setLeaveReason("");
        setMessage(null);
        leaveCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return (<DashboardShell title="Admin console" subtitle="Manage doctors, profiles and leave days">
      {message && (<div className={`rounded-xl px-4 py-3 text-sm border ${message.ok
                ? "bg-emerald-50 text-emerald-800 border-emerald-100"
                : "bg-red-50 text-urgency-high border-red-100"}`}>
          {message.text}
        </div>)}

      
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Patients" value={stats?.patients ?? 0} accent="border-primary"/>
        <Stat label="Doctors" value={doctors.length} accent="border-blue-400"/>
        <Stat label="Active profiles" value={activeProfiles} accent={activeProfiles > 0 ? "border-emerald-500" : "border-slate-300"}/>
        <Stat label="Today's visits" value={stats?.todayConfirmed ?? 0} accent="border-violet-400"/>
        <Stat label="Completed" value={stats?.byStatus?.COMPLETED ?? 0} accent="border-teal-400"/>
        <Stat label="Cancelled" value={stats?.byStatus?.CANCELLED ?? 0} accent={(stats?.byStatus?.CANCELLED ?? 0) > 0 ? "border-red-400" : "border-slate-300"}/>
      </div>

      
      <Card title="Doctor roster">
        {doctors.length === 0 ? (<p className="text-sm text-slate-500">
            No doctor accounts yet — doctors register themselves via the Register page, then you
            create their profile here.
          </p>) : (<ul className="divide-y divide-slate-100 -mx-2">
            {doctors.map((d) => (<Fragment key={d._id}>
                <li className="py-3 px-2 flex items-center gap-4">
                  <Avatar name={d.name} tone={d.profile ? "primary" : "slate"}/>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900 truncate">Dr. {d.name}</p>
                    <p className="text-sm text-slate-500 truncate">{d.email}</p>
                  </div>
                  {d.profile ? (<>
                      {d.profile.isActive ? (<span className="hidden sm:inline-block rounded-full bg-primary-light text-primary-dark px-2.5 py-0.5 text-xs font-medium whitespace-nowrap">
                          {d.profile.specialization}
                        </span>) : (<span className="rounded-full bg-slate-200 text-slate-600 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap">
                          Paused
                        </span>)}
                      <span className="hidden md:inline text-sm text-slate-500 whitespace-nowrap">
                        {d.profile.slotDurationMinutes} min slots
                      </span>
                      <button onClick={() => toggleActive(d)} disabled={busy} className={`text-sm font-medium hover:underline whitespace-nowrap ${d.profile.isActive ? "text-urgency-medium" : "text-emerald-600"}`}>
                        {d.profile.isActive ? "Deactivate" : "Activate"}
                      </button>
                      <button onClick={() => startLeaveFor(d)} className="text-sm text-amber-600 font-medium hover:underline whitespace-nowrap">
                        Mark leave
                      </button>
                      <button onClick={() => setExpandedId(expandedId === d._id ? null : d._id)} className="text-sm text-primary font-medium hover:underline whitespace-nowrap">
                        {expandedId === d._id ? "Hide hours ↑" : "Weekly hours"}
                      </button>
                    </>) : (<span className="rounded-full bg-amber-100 text-amber-800 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap">
                      Needs setup
                    </span>)}
                </li>
                {expandedId === d._id && d.profile && (<li className="px-2 pb-4">
                    <WeeklySchedule doctor={d}/>
                  </li>)}
              </Fragment>))}
          </ul>)}
      </Card>

      
      <Card title="Create doctor profile">
        {unprofiled.length === 0 ? (<p className="text-sm text-slate-500">
            Every doctor account has a profile here. To onboard a new clinician:
          find their account under <strong>User accounts</strong>, click
          <strong> Make doctor</strong>, and their row will appear above for
          profile setup.
          </p>) : (<div className="space-y-4 max-w-xl">
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">
              {unprofiled.length} doctor{unprofiled.length > 1 ? "s" : ""} waiting for a profile before
              patients can book them.
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Doctor account</label>
              <select className={inputClass} value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                {unprofiled.map((d) => (<option key={d._id} value={d._id}>
                    Dr. {d.name} ({d.email})
                  </option>))}
              </select>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Specialization</label>
                <input className={inputClass} placeholder="e.g. Cardiology" value={specialization} onChange={(e) => setSpecialization(e.target.value)}/>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Slot duration (minutes)</label>
                <input type="number" min={5} className={inputClass} value={slotDuration} onChange={(e) => setSlotDuration(Number(e.target.value))}/>
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Working hours — one weekday per line, blank = day off
              </label>
              <textarea rows={7} className={`${inputClass} font-mono text-sm`} value={hoursText} onChange={(e) => setHoursText(e.target.value)}/>
            </div>
            <button onClick={createProfile} disabled={busy || !selectedUserId || specialization.trim().length < 2} className={btnClass}>
              Create profile
            </button>
          </div>)}
      </Card>

      
      <div ref={leaveCardRef}>
      <Card title="Mark doctor leave">
        <p className="text-sm text-slate-500 mb-4">
          Cancels all of that doctor's confirmed appointments for the date and emails the affected
          patients automatically. Tip: use a doctor row's <span className="font-medium text-amber-600">Mark leave</span> button to pre-fill this form.
        </p>
        <div className="grid sm:grid-cols-2 gap-3 max-w-xl">
          <div className="sm:col-span-2">
            <label className="block text-sm text-slate-600 mb-1">Doctor</label>
            <select className={inputClass} value={leaveDoctorId} onChange={(e) => setLeaveDoctorId(e.target.value)}>
              {doctors.map((d) => (<option key={d._id} value={d._id}>
                  Dr. {d.name}
                </option>))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Date</label>
            <input type="date" className={inputClass} value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)}/>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Reason (optional)</label>
            <input className={inputClass} placeholder="e.g. Conference, emergency" value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)}/>
          </div>
          <div className="sm:col-span-2">
            <button onClick={markLeave} disabled={busy || !leaveDoctorId || !leaveDate} className={btnClass}>
              Mark leave &amp; cancel appointments
            </button>
          </div>
        </div>
      </Card>
      </div>

      
      <Card title="User accounts" actions={<select className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary" value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
            <option value="ALL">All roles</option>
            <option value="patient">Patients</option>
            <option value="doctor">Doctors</option>
            <option value="admin">Admins</option>
          </select>}>
        {filteredUsers.length === 0 ? (<p className="text-sm text-slate-500">No users match this filter.</p>) : (<ul className="divide-y divide-slate-100 -mx-2">
            {filteredUsers.map((u) => (<li key={u._id} className="py-3 px-2 flex items-center gap-4">
                <Avatar name={u.name} tone={u.role === "admin" ? "slate" : "primary"}/>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{u.name}</p>
                  <p className="text-xs text-slate-500 truncate">{u.email}</p>
                </div>
                <span className={`hidden sm:inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${u.role === "patient"
                    ? "bg-blue-100 text-blue-800"
                    : u.role === "doctor"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-200 text-slate-600"}`}>
                  {u.role}
                </span>
                {u.isActive ? (<span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/> Active
                  </span>) : (<span className="inline-flex items-center gap-1.5 text-xs text-red-600 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500"/> Disabled
                  </span>)}
                {u.role !== "admin" && (<button onClick={() => toggleUser(u)} disabled={busy} className={`text-sm font-medium hover:underline whitespace-nowrap ${u.isActive ? "text-urgency-high" : "text-emerald-600"}`}>
                    {u.isActive ? "Disable" : "Enable"}
                  </button>)}
                {u.role === "patient" && (<button onClick={() => changeRole(u, "doctor")} disabled={busy} className="text-sm font-medium text-blue-600 hover:underline whitespace-nowrap">
                    Make doctor
                  </button>)}
                {u.role === "doctor" && (<button onClick={() => changeRole(u, "patient")} disabled={busy} className="text-sm font-medium text-slate-500 hover:underline whitespace-nowrap">
                    Make patient
                  </button>)}
              </li>))}
          </ul>)}
        <p className="text-xs text-slate-400 mt-3">
          Disabling an account blocks login and revokes existing sessions immediately. Admin accounts cannot be disabled.
          Use <strong>Make doctor</strong> to grant clinician access — then set up their profile and weekly hours in the Doctor roster above.
        </p>
      </Card>

      
      <Card title="Upcoming leave days">
        {leaves.length === 0 ? (<p className="text-sm text-slate-500">No upcoming leave days on the calendar.</p>) : (<ul className="divide-y divide-slate-100 -mx-2">
            {leaves.map((l) => (<li key={l._id} className="py-3 px-2 flex items-center gap-4">
                <div className="w-10 h-10 shrink-0 rounded-lg bg-slate-100 flex flex-col items-center justify-center leading-none">
                  <span className="text-[10px] uppercase text-slate-400">
                    {new Date(`${l.date}T00:00:00`).toLocaleDateString(undefined, { month: "short" })}
                  </span>
                  <span className="text-sm font-semibold text-slate-700">{Number(l.date.slice(8))}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    Dr. {nameOf(l.doctorId)} · {leaveDateLabel(l.date)}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{l.reason || "No reason given"}</p>
                </div>
                <button onClick={() => removeLeave(l._id)} disabled={busy} className="text-sm text-primary font-medium hover:underline whitespace-nowrap">
                  Remove
                </button>
              </li>))}
          </ul>)}
        {leaves.length > 0 && (<p className="text-xs text-slate-400 mt-3">
            Removing a leave makes the doctor bookable again. Appointments already cancelled because of it are not restored.
          </p>)}
      </Card>

      
      <Card title="All appointments" actions={<select className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary" value={apptFilter} onChange={(e) => setApptFilter(e.target.value)}>
            <option value="ALL">All statuses</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="HELD">Held</option>
          </select>}>
        {filteredAppts.length === 0 ? (<p className="text-sm text-slate-500">No appointments match this filter yet.</p>) : (<ul className="divide-y divide-slate-100 -mx-2">
            {filteredAppts.map((a) => (<li key={a._id} className="py-3 px-2 flex items-center gap-4">
                <Avatar name={typeof a.patientId === "string" ? "?" : a.patientId.name} size="sm"/>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-900 truncate">
                    <span className="font-medium">{nameOf(a.patientId)}</span>
                    <span className="text-slate-400"> → </span>
                    Dr. {nameOf(a.doctorId)}
                  </p>
                  <p className="text-xs text-slate-500">{whenLabel(a.slotStart)}</p>
                </div>
                <StatusBadge status={a.status}/>
                {a.status === "CONFIRMED" && (<button onClick={() => adminCancel(a._id)} disabled={busy} className="text-sm text-urgency-high hover:underline whitespace-nowrap">
                    Cancel
                  </button>)}
              </li>))}
          </ul>)}
        <p className="text-xs text-slate-400 mt-3">Showing the 50 most recent, newest first.</p>
      </Card>
    </DashboardShell>);
}
