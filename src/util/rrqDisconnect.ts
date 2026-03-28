import type { Player, Track, UnresolvedTrack } from "lavalink-client"
import type { RRQDisconnectedUsersMap } from "../types/index.js"

const RRQ_DISCONNECTED_USERS_KEY = "rrqDisconnectedUsers"
const RRQ_ENABLED_KEY = "rrqEnabled"

/** Discord user id or Lavalink-style requester payload; RRQ stamps string ids for stable reads via getRequesterUserId. */
export type RrqRequester = string | { id: string }

/** Discord user id from a Lavalink requester (string id or object with `id`). */
const UNKNOWN_REQUESTER_KEY = "__unknown__"

/** Sentinel: no "previous" requester for adjacency (nothing playing or fresh sequence). */
const RRQ_NO_PREVIOUS = "__rrq_none__"

export function getRequesterUserId(requester: unknown): string | null {
    if (typeof requester === "string") return requester
    if (typeof requester === "object" && requester !== null && "id" in requester) {
        const id = (requester as { id: unknown }).id
        if (typeof id === "string") return id
    }
    return null
}

function requesterMatchesUser(requester: unknown, userId: string): boolean {
    return getRequesterUserId(requester) === userId
}

/** Sets `track.requester` to the Discord user id so RRQ logic always has a stable string id (see getRequesterUserId). */
function setRequesterUserId(track: Track | UnresolvedTrack, userId: string): void {
    const requester: RrqRequester = userId
    ;(track as (Track | UnresolvedTrack) & { requester?: RrqRequester }).requester = requester
}

export function stampRequesterUserIdOnTracks(
    tracks: (Track | UnresolvedTrack)[],
    userId: string
): void {
    for (const t of tracks) setRequesterUserId(t, userId)
}

/**
 * Reorders upcoming tracks so the same requester is avoided back-to-back when possible
 * (uses the currently playing track’s requester as the prior slot).
 * Heavier requesters are scheduled earlier among valid choices to reduce long same-user runs at the tail.
 */
export function roundRobinReorderTracks(
    tracks: (Track | UnresolvedTrack)[],
    previousRequesterKey: string
): (Track | UnresolvedTrack)[] {
    if (tracks.length <= 1) return [...tracks]

    const byUser = new Map<string, (Track | UnresolvedTrack)[]>()
    for (const t of tracks) {
        const id = getRequesterUserId(t.requester) ?? UNKNOWN_REQUESTER_KEY
        const list = byUser.get(id)
        if (list) list.push(t)
        else byUser.set(id, [t])
    }

    const result: (Track | UnresolvedTrack)[] = []
    let lastPlaced = previousRequesterKey

    while (byUser.size > 0) {
        const keysWithTracks = [...byUser.keys()].filter((k) => byUser.get(k)!.length > 0)
        const candidates = keysWithTracks.filter((k) => k !== lastPlaced)
        let pickKey: string
        if (candidates.length > 0) {
            pickKey = candidates.reduce((best, k) =>
                byUser.get(k)!.length > byUser.get(best)!.length ? k : best
            )
        } else {
            pickKey = keysWithTracks.reduce((best, k) =>
                byUser.get(k)!.length > byUser.get(best)!.length ? k : best
            )
        }
        const arr = byUser.get(pickKey)!
        const next = arr.shift()!
        if (arr.length === 0) byUser.delete(pickKey)
        result.push(next)
        lastPlaced = pickKey
    }

    return result
}

/** Core reorder; must run inside enqueueRrqMutation (or call exported rebalancePlayerQueueRoundRobin). */
async function rebalancePlayerQueueRoundRobinImpl(player: Player): Promise<void> {
    if (!isRRQActive(player)) return
    const tracks = player.queue.tracks
    const n = tracks.length
    if (n <= 1) return

    const current = player.queue.current
    const previousKey = current
        ? (getRequesterUserId(current.requester) ?? UNKNOWN_REQUESTER_KEY)
        : RRQ_NO_PREVIOUS

    const ordered = roundRobinReorderTracks([...tracks], previousKey)
    const unchanged = ordered.length === n && ordered.every((t, i) => t === tracks[i])
    if (unchanged) return

    await player.queue.splice(0, n, ordered)
}

/**
 * Re-sorts `player.queue.tracks` for round-robin fairness when RRQ mode is on.
 * Serialized per guild with other RRQ queue mutations so snapshot/reorder cannot race concurrent splices.
 */
export async function rebalancePlayerQueueRoundRobin(player: Player): Promise<void> {
    return enqueueRrqMutation(player.guildId, () => rebalancePlayerQueueRoundRobinImpl(player))
}

/** Returns the per-player map of users pending RRQ disconnect cleanup, creating it if missing. */
export function getDisconnectedUsers(player: Player): RRQDisconnectedUsersMap {
    const existing = player.get(RRQ_DISCONNECTED_USERS_KEY) as unknown
    if (existing instanceof Map) {
        return existing as RRQDisconnectedUsersMap
    }
    const map: RRQDisconnectedUsersMap = new Map()
    player.set(RRQ_DISCONNECTED_USERS_KEY, map)
    return map
}

/** Records a pending disconnect cleanup timer for a user (replaces any prior timer for that user). */
export function trackDisconnectedUser(
    player: Player,
    userId: string,
    timeoutHandle: NodeJS.Timeout
): void {
    const map = getDisconnectedUsers(player)
    const prior = map.get(userId)
    if (prior) clearTimeout(prior.timeoutHandle)
    map.set(userId, { userId, leftAt: Date.now(), timeoutHandle })
}

/** Cancels the disconnect timer and removes tracking for a user. */
export function clearDisconnectedUser(player: Player, userId: string): void {
    const raw = player.get(RRQ_DISCONNECTED_USERS_KEY) as unknown
    if (!(raw instanceof Map)) return
    const map = raw as RRQDisconnectedUsersMap
    const entry = map.get(userId)
    if (!entry) return
    clearTimeout(entry.timeoutHandle)
    map.delete(userId)
}

/** Whether round-robin queue mode (and disconnect cleanup) is enabled for this player. */
export function isRRQActive(player: Player): boolean {
    return player.get(RRQ_ENABLED_KEY) === true
}

/** True if the user has a pending disconnect cleanup entry (without creating a map). */
export function hasTrackedDisconnect(player: Player, userId: string): boolean {
    const raw = player.get(RRQ_DISCONNECTED_USERS_KEY) as unknown
    return raw instanceof Map && (raw as RRQDisconnectedUsersMap).has(userId)
}

/** True if this timer is still the active disconnect cleanup for the user (guards stale callbacks). */
export function isDisconnectTimeoutCurrent(
    player: Player,
    userId: string,
    timeoutHandle: NodeJS.Timeout
): boolean {
    const raw = player.get(RRQ_DISCONNECTED_USERS_KEY) as unknown
    if (!(raw instanceof Map)) return false
    const map = raw as RRQDisconnectedUsersMap
    const entry = map.get(userId)
    return entry?.timeoutHandle === timeoutHandle
}

function clearAllDisconnectedTimers(player: Player): void {
    const raw = player.get(RRQ_DISCONNECTED_USERS_KEY) as unknown
    if (!(raw instanceof Map)) return
    const map = raw as RRQDisconnectedUsersMap
    for (const entry of map.values()) {
        clearTimeout(entry.timeoutHandle)
    }
    map.clear()
}

/**
 * Toggles RRQ on/off. When disabling, clears all pending disconnect timers.
 * @returns The new enabled state.
 */
export function toggleRRQ(player: Player): boolean {
    const next = !isRRQActive(player)
    player.set(RRQ_ENABLED_KEY, next)
    if (!next) clearAllDisconnectedTimers(player)
    return next
}

/** True if the user has any upcoming queued tracks (not the current track). */
export function userHasQueuedTracks(player: Player, userId: string): boolean {
    return player.queue.tracks.some((track) => requesterMatchesUser(track.requester, userId))
}

/**
 * Removes upcoming queue tracks requested by the user. Does not alter the currently playing track.
 * @returns How many tracks were removed.
 */
export async function removeUserTracksFromQueue(player: Player, userId: string): Promise<number> {
    let removed = 0
    for (let i = player.queue.tracks.length - 1; i >= 0; i--) {
        const track = player.queue.tracks[i]
        if (requesterMatchesUser(track.requester, userId)) {
            await player.queue.splice(i, 1)
            removed++
        }
    }
    return removed
}

const rrqMutationChainByGuild = new Map<string, Promise<unknown>>()

function enqueueRrqMutation<T>(guildId: string, work: () => Promise<T>): Promise<T> {
    const prior = rrqMutationChainByGuild.get(guildId) ?? Promise.resolve()
    const result = prior.then(() => work())
    rrqMutationChainByGuild.set(
        guildId,
        result.then(
            () => undefined,
            () => undefined
        )
    )
    return result
}

export type RemoveAndRebalanceRrqHooks = {
    onRemoveError?: (err: unknown) => void
    onRebalanceError?: (err: unknown) => void
}

/**
 * Runs disconnect cleanup (remove user’s queued tracks, clear disconnect tracking, optional rebalance)
 * serialized per guild so reordering cannot race with other RRQ queue mutations for that player.
 */
export async function removeAndRebalanceRrqAfterDisconnect(
    player: Player,
    userId: string,
    hooks?: RemoveAndRebalanceRrqHooks
): Promise<number> {
    return enqueueRrqMutation(player.guildId, async () => {
        let removedCount = 0
        try {
            removedCount = await removeUserTracksFromQueue(player, userId)
        } catch (err: unknown) {
            hooks?.onRemoveError?.(err)
        } finally {
            clearDisconnectedUser(player, userId)
        }

        if (removedCount > 0 && isRRQActive(player)) {
            try {
                await rebalancePlayerQueueRoundRobinImpl(player)
            } catch (rebalErr: unknown) {
                hooks?.onRebalanceError?.(rebalErr)
            }
        }

        return removedCount
    })
}
