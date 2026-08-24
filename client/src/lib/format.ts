export function fmtSlot(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
        timeZone: "Asia/Kolkata",
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}
export function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString(undefined, {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
    });
}
export function whenLabel(iso: string): string {
    const d = new Date(iso);
    const dayNumber = (x: Date) => Math.floor(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 86400000);
    const diffDays = dayNumber(d) - dayNumber(new Date());
    if (diffDays === 0)
        return `Today · ${fmtTime(iso)}`;
    if (diffDays === 1)
        return `Tomorrow · ${fmtTime(iso)}`;
    if (diffDays === -1)
        return `Yesterday · ${fmtTime(iso)}`;
    return fmtSlot(iso);
}
export function initials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]!.toUpperCase())
        .join("");
}
