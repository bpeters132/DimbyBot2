import type { PersistedQueueTrack, PlayerSessionSnapshotV1 } from "../types/index.js"

/** Parses one persisted queue track from JSON; null when required fields are missing or invalid. */
export function parsePersistedQueueTrack(value: unknown): PersistedQueueTrack | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    const raw = value as Record<string, unknown>
    if (typeof raw.title !== "string" || !raw.title.trim()) return null
    if (typeof raw.author !== "string" || !raw.author.trim()) return null
    if (typeof raw.uri !== "string" || !raw.uri.trim()) return null
    if (typeof raw.duration !== "number" || !Number.isFinite(raw.duration)) return null
    if (typeof raw.isStream !== "boolean") return null

    let encoded: string | null = null
    if (raw.encoded !== null && raw.encoded !== undefined) {
        if (typeof raw.encoded !== "string") return null
        encoded = raw.encoded
    }
    let requesterId: string | null = null
    if (raw.requesterId !== null && raw.requesterId !== undefined) {
        if (typeof raw.requesterId !== "string") return null
        requesterId = raw.requesterId
    }
    let thumbnailUrl: string | null = null
    if (raw.thumbnailUrl !== null && raw.thumbnailUrl !== undefined) {
        if (typeof raw.thumbnailUrl !== "string") return null
        thumbnailUrl = raw.thumbnailUrl
    }

    return {
        title: raw.title.trim(),
        author: raw.author.trim(),
        uri: raw.uri.trim(),
        duration: raw.duration,
        encoded,
        requesterId,
        thumbnailUrl,
        isStream: raw.isStream,
    }
}

/** Parses a v1 player-session snapshot from JSON; null when the payload is corrupt or incomplete. */
export function parsePlayerSessionSnapshot(value: unknown): PlayerSessionSnapshotV1 | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    const raw = value as Record<string, unknown>
    if (raw.version !== 1) return null
    if (typeof raw.volume !== "number" || !Number.isFinite(raw.volume)) return null
    if (raw.repeatMode !== "off" && raw.repeatMode !== "track" && raw.repeatMode !== "queue") {
        return null
    }
    if (typeof raw.paused !== "boolean" || typeof raw.playing !== "boolean") return null
    if (typeof raw.autoplay !== "boolean" || typeof raw.rrqEnabled !== "boolean") return null
    if (!Array.isArray(raw.queue)) return null

    let current: PersistedQueueTrack | null = null
    if (raw.current !== null) {
        current = parsePersistedQueueTrack(raw.current)
        if (!current) return null
    }

    const queue: PersistedQueueTrack[] = []
    for (const item of raw.queue) {
        const track = parsePersistedQueueTrack(item)
        if (!track) return null
        queue.push(track)
    }

    return {
        version: 1,
        volume: raw.volume,
        repeatMode: raw.repeatMode,
        paused: raw.paused,
        playing: raw.playing,
        autoplay: raw.autoplay,
        rrqEnabled: raw.rrqEnabled,
        current,
        queue,
    }
}
