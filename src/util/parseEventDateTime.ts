const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export type ParseEventDateTimeResult =
    | { ok: true; epochSeconds: number }
    | { ok: false; error: string }

/** Validates that a string is a usable IANA time zone (e.g. `America/Chicago`). */
function isValidTimeZone(timeZone: string): boolean {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone })
        return true
    } catch {
        return false
    }
}

/**
 * Returns the offset (ms) of `timeZone` from UTC at the given instant.
 * Positive means the zone is ahead of UTC. Uses the locale-string round-trip technique
 * so no external date library is required.
 */
function timeZoneOffsetMs(timeZone: string, instant: Date): number {
    const tzDate = new Date(instant.toLocaleString("en-US", { timeZone }))
    const utcDate = new Date(instant.toLocaleString("en-US", { timeZone: "UTC" }))
    return tzDate.getTime() - utcDate.getTime()
}

/** Wall-clock Y/M/D/H/M components of `instant` in `timeZone` (24h). */
function wallClockParts(
    timeZone: string,
    instant: Date
): { year: number; month: number; day: number; hour: number; minute: number } | null {
    try {
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
        }).formatToParts(instant)
        const get = (type: Intl.DateTimeFormatPartTypes): string | undefined =>
            parts.find((p) => p.type === type)?.value
        const year = Number(get("year"))
        const month = Number(get("month"))
        const day = Number(get("day"))
        const hour = Number(get("hour"))
        const minute = Number(get("minute"))
        if (![year, month, day, hour, minute].every((n) => Number.isFinite(n))) return null
        return { year, month, day, hour, minute }
    } catch {
        return null
    }
}

/**
 * Converts a wall-clock `date` (`YYYY-MM-DD`) and `time` (`HH:MM`, 24h) interpreted in
 * `timeZone` (IANA name) to a Unix timestamp in seconds. Validates formats, calendar validity,
 * and the time zone. Offset is iterated at the candidate instant so DST transitions are correct;
 * nonexistent spring-forward gap times are rejected.
 */
export function parseEventDateTime(
    date: string,
    time: string,
    timeZone: string
): ParseEventDateTimeResult {
    const d = date.trim()
    const t = time.trim()
    if (!DATE_RE.test(d)) {
        return { ok: false, error: "Date must be in `YYYY-MM-DD` format (e.g. `2026-12-25`)." }
    }
    if (!TIME_RE.test(t)) {
        return { ok: false, error: "Time must be in 24-hour `HH:MM` format (e.g. `18:30`)." }
    }
    if (!isValidTimeZone(timeZone)) {
        return { ok: false, error: `Unknown time zone: \`${timeZone}\`.` }
    }

    const [year, month, day] = d.split("-").map(Number) as [number, number, number]
    const [hour, minute] = t.split(":").map(Number) as [number, number]

    // Treat the wall-clock components as if they were UTC, then shift by the zone's offset.
    const asUtc = Date.UTC(year, month - 1, day, hour, minute)

    // Reject calendar overflow (e.g. 2026-02-30 rolling into March).
    const check = new Date(asUtc)
    if (
        check.getUTCFullYear() !== year ||
        check.getUTCMonth() !== month - 1 ||
        check.getUTCDate() !== day
    ) {
        return { ok: false, error: "That date does not exist on the calendar." }
    }

    // Iterate: a single offset sampled at `asUtc` is wrong near DST transitions (e.g. Chicago
    // spring-forward mornings), because that UTC instant still sits in the previous offset.
    let epochMs = asUtc
    for (let i = 0; i < 5; i++) {
        const offset = timeZoneOffsetMs(timeZone, new Date(epochMs))
        const next = asUtc - offset
        if (next === epochMs) break
        epochMs = next
    }

    const wall = wallClockParts(timeZone, new Date(epochMs))
    if (
        !wall ||
        wall.year !== year ||
        wall.month !== month ||
        wall.day !== day ||
        wall.hour !== hour ||
        wall.minute !== minute
    ) {
        // Spring-forward gap (e.g. 02:30 on the day clocks jump) has no unique local instant.
        return {
            ok: false,
            error: "That local time does not exist on that date (DST transition gap).",
        }
    }

    return { ok: true, epochSeconds: Math.floor(epochMs / 1000) }
}
