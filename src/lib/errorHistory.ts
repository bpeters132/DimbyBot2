const ERROR_HISTORY_CAP = 500
const DISCORD_SNOWFLAKE_IN_MESSAGE_RE = /\b\d{17,20}\b/

export interface ErrorHistoryEntry {
    timestamp: number
    level: "error" | "warn"
    message: string
    guildId?: string
    stack?: string
}

const buffer: ErrorHistoryEntry[] = []

function extractGuildIdFromMessage(message: string): string | undefined {
    const match = message.match(DISCORD_SNOWFLAKE_IN_MESSAGE_RE)
    return match?.[0]
}

/** Records a log line in the in-memory ring buffer (newest first). */
export function captureError(
    level: "error" | "warn",
    message: string,
    timestamp: number,
    stack?: string
): void {
    const entry: ErrorHistoryEntry = {
        timestamp,
        level,
        message,
        stack,
    }
    const guildId = extractGuildIdFromMessage(message)
    if (guildId) {
        entry.guildId = guildId
    }
    buffer.unshift(entry)
    if (buffer.length > ERROR_HISTORY_CAP) {
        buffer.length = ERROR_HISTORY_CAP
    }
}

/** Returns the most recent error/warn entries (newest first). */
export function getRecentErrors(limit = 100): ErrorHistoryEntry[] {
    const capped = Math.max(1, Math.min(limit, ERROR_HISTORY_CAP))
    return buffer.slice(0, capped)
}

/** Returns recent entries whose message contained the given guild snowflake. */
export function getErrorsByGuild(guildId: string, limit = 100): ErrorHistoryEntry[] {
    const capped = Math.max(1, Math.min(limit, ERROR_HISTORY_CAP))
    const filtered = buffer.filter((e) => e.guildId === guildId)
    return filtered.slice(0, capped)
}

/** Clears all buffered entries (admin maintenance). */
export function clearErrorHistory(): void {
    buffer.length = 0
}
