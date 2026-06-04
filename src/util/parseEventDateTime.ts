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

/**
 * Converts a wall-clock `date` (`YYYY-MM-DD`) and `time` (`HH:MM`, 24h) interpreted in
 * `timeZone` (IANA name) to a Unix timestamp in seconds. Validates formats, calendar validity,
 * and the time zone. The offset is resolved at the target instant so DST is accounted for.
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

    const offset = timeZoneOffsetMs(timeZone, new Date(asUtc))
    const epochMs = asUtc - offset
    return { ok: true, epochSeconds: Math.floor(epochMs / 1000) }
}
