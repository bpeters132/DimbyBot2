import { getRequesterUserId } from "./rrqDisconnect.js"

/** Stored on the Lavalink `Player` via {@link DASHBOARD_REQUESTER_KEY} for web API / WS payloads. */
export const DASHBOARD_REQUESTER_KEY = "dashboardRequester"

export interface DashboardRequesterSnapshot {
    id: string
    username?: string
}

/**
 * Builds a small JSON-serializable snapshot from a Lavalink `track.requester` (Discord.js `User`,
 * plain `{ id, username }`, or stamped snowflake string).
 */
export function snapshotFromRequester(requester: unknown): DashboardRequesterSnapshot | null {
    const id = getRequesterUserId(requester)
    if (!id) return null
    if (typeof requester === "object" && requester !== null) {
        const o = requester as Record<string, unknown>
        const username =
            (typeof o.globalName === "string" && o.globalName.trim()) ||
            (typeof o.username === "string" && o.username.trim()) ||
            (typeof o.displayName === "string" && o.displayName.trim()) ||
            undefined
        if (username) return { id, username }
    }
    return { id }
}
