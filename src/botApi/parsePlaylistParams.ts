import type { AddPlaylistTrackBody } from "../types/web.js"

const STRICT_POSITIVE_INT = /^[1-9]\d*$/

/** Parses a decimal integer ≥ 1; rejects leading zeros, signs, and floats. */
export function parseStrictPositiveInt(value: string): number | null {
    const trimmed = value.trim()
    if (!STRICT_POSITIVE_INT.test(trimmed)) return null
    const n = Number.parseInt(trimmed, 10)
    if (!Number.isFinite(n) || n < 1) return null
    return n
}

/** Playlist id path segment (same rules as {@link parseStrictPositiveInt}). */
export function parsePlaylistId(playlistId: string): number | null {
    return parseStrictPositiveInt(playlistId)
}

/** 1-based track position path segment. */
export function parsePosition(position: string): number | null {
    return parseStrictPositiveInt(position)
}

/**
 * Parses `newPosition` from a playlist track-move JSON body.
 * Accepts integer numbers or digit strings; rejects floats, zero, and negatives.
 */
export function parseNewPosition(raw: unknown): number | null {
    if (typeof raw === "number") {
        if (!Number.isInteger(raw) || raw < 1) return null
        return raw
    }
    if (typeof raw === "string") {
        return parseStrictPositiveInt(raw)
    }
    return null
}

/** Validates a manual add-track body; trims strings and floors duration. */
export function parseTrackBody(raw: unknown): AddPlaylistTrackBody | null {
    if (!raw || typeof raw !== "object") return null
    const b = raw as Record<string, unknown>
    if (typeof b.title !== "string" || !b.title.trim()) return null
    if (typeof b.uri !== "string" || !b.uri.trim()) return null
    if (typeof b.author !== "string") return null
    if (typeof b.duration !== "number" || !Number.isFinite(b.duration) || b.duration < 0) {
        return null
    }
    if (typeof b.addedAt !== "string" || !b.addedAt.trim()) return null
    const added = new Date(b.addedAt)
    if (Number.isNaN(added.getTime())) return null
    const thumbnailUrl =
        typeof b.thumbnailUrl === "string" && b.thumbnailUrl.trim() ? b.thumbnailUrl.trim() : null
    return {
        title: b.title.trim(),
        uri: b.uri.trim(),
        author: b.author.trim() || "Unknown",
        duration: Math.floor(b.duration),
        thumbnailUrl,
        addedAt: b.addedAt,
    }
}
