export type UserRole = "patient" | "doctor" | "admin";
export interface AuthUser {
    id: string;
    name: string;
    email: string;
    role: UserRole;
}
export type UrgencyLevel = "Low" | "Medium" | "High";
export interface UserRef {
    _id: string;
    name: string;
    email?: string;
}
export interface WorkingHoursSlot {
    start: string;
    end: string;
}
export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export interface DoctorProfile {
    _id: string;
    userId: string;
    specialization: string;
    workingHours: Record<WeekdayKey, WorkingHoursSlot[]>;
    slotDurationMinutes: number;
    isActive: boolean;
}
export interface DoctorListItem {
    _id: string;
    name: string;
    email: string;
    specialization?: string;
    slotDurationMinutes?: number;
    profile?: DoctorProfile | null;
}
export interface Slot {
    slotStart: string;
    slotEnd: string;
}
export interface Appointment {
    _id: string;
    patientId: string | UserRef;
    doctorId: string | UserRef;
    slotStart: string;
    slotEnd: string;
    status: "HELD" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "RESCHEDULED";
    holdExpiresAt?: string | null;
}
export interface PreVisitSummary {
    _id: string;
    urgencyLevel: UrgencyLevel | null;
    chiefComplaint: string | null;
    suggestedQuestions: string[];
    llmStatus: "OK" | "FAILED";
}
export interface SymptomForm {
    _id: string;
    rawSymptoms: string;
    submittedAt: string;
}
export interface PrescriptionItem {
    medicationName: string;
    dosage: string;
    frequency: string;
    durationDays: number;
}
export interface PostVisitNoteT {
    _id: string;
    clinicalNotes: string;
    prescription: PrescriptionItem[];
}
export interface MedicationScheduleItem {
    medicationName: string;
    timeOfDay: string[];
}
export interface PostVisitSummaryT {
    _id: string;
    patientFriendlyText: string | null;
    medicationSchedule: MedicationScheduleItem[];
    followUpSteps: string | null;
    llmStatus: "OK" | "FAILED";
}
export interface NotificationLogT {
    _id: string;
    type: "BOOKING_CONFIRM" | "REMINDER" | "CANCELLATION" | "RESCHEDULED" | "LEAVE_CONFLICT";
    channel: "EMAIL" | "CALENDAR";
    status: "PENDING" | "SENT" | "FAILED";
    createdAt: string;
    lastError?: string;
}
export interface PatientHistoryVisit {
    _id: string;
    slotStart: string;
    status: Appointment["status"];
    prescription: PrescriptionItem[];
    medicationSchedule: MedicationScheduleItem[];
}
export interface AdminUserT {
    _id: string;
    name: string;
    email: string;
    role: UserRole;
    isActive: boolean;
    createdAt: string;
}
