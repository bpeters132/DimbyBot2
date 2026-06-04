/**
 * Formats remaining milliseconds as a human-readable countdown string, e.g.
 * `"3 days, 4 hours, 20 minutes"` or `"45 minutes"`. Seconds are intentionally omitted because
 * countdown messages only refresh once per minute, so a seconds value would always be stale.
 * Zero-value units are omitted. Returns `"Event started!"` for non-positive or non-finite input.
 */
export function formatCountdownDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) {
        return "Event started!"
    }

    const totalMinutes = Math.floor(ms / 60000)
    const days = Math.floor(totalMinutes / 1440)
    const hours = Math.floor((totalMinutes % 1440) / 60)
    const minutes = totalMinutes % 60

    const parts: string[] = []
    if (days > 0) parts.push(`${days} ${days === 1 ? "day" : "days"}`)
    if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`)
    if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`)

    // Possible only when 0 < ms < 60000 (under a minute rounds all buckets to zero).
    if (parts.length === 0) {
        return "Less than a minute"
    }

    return parts.join(", ")
}
