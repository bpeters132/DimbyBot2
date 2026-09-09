import type {
    LoggerInterface,
    YoutubeAlertEntry,
    YoutubeAlertInput,
    YoutubeAlertPatch,
    YoutubeChannelLeaseEntry,
    YoutubeWatchEntry,
} from "../types/index.js"
import {
    addYoutubeSeenVideos as addYoutubeSeenVideosInDatabase,
    createYoutubeAlertWithWatch as createYoutubeAlertWithWatchInDatabase,
    deleteYoutubeAlert as deleteYoutubeAlertInDatabase,
    deleteYoutubeChannelLease as deleteYoutubeChannelLeaseInDatabase,
    getAllYoutubeWatchesFromDatabase,
    updateYoutubeAlert as updateYoutubeAlertInDatabase,
    upsertYoutubeChannelLease as upsertYoutubeChannelLeaseInDatabase,
} from "../repositories/youtubeAlertRepository.js"
import { loggerFromPartial } from "./loggerFromPartial.js"

type StoreSnapshot = {
    watches: Record<number, YoutubeWatchEntry>
    alerts: Record<number, YoutubeAlertEntry>
    seenByWatch: Record<number, Set<string>>
    leases: Record<string, YoutubeChannelLeaseEntry>
}

type YoutubeAlertStoreDb = {
    getAllYoutubeWatchesFromDatabase: typeof getAllYoutubeWatchesFromDatabase
    createYoutubeAlertWithWatch: typeof createYoutubeAlertWithWatchInDatabase
    updateYoutubeAlert: typeof updateYoutubeAlertInDatabase
    deleteYoutubeAlert: typeof deleteYoutubeAlertInDatabase
    addYoutubeSeenVideos: typeof addYoutubeSeenVideosInDatabase
    upsertYoutubeChannelLease: typeof upsertYoutubeChannelLeaseInDatabase
    deleteYoutubeChannelLease: typeof deleteYoutubeChannelLeaseInDatabase
}

let cache: StoreSnapshot = emptySnapshot()
let initialized = false
let saveChain: Promise<void> = Promise.resolve()

let storeDb: YoutubeAlertStoreDb = {
    getAllYoutubeWatchesFromDatabase,
    createYoutubeAlertWithWatch: createYoutubeAlertWithWatchInDatabase,
    updateYoutubeAlert: updateYoutubeAlertInDatabase,
    deleteYoutubeAlert: deleteYoutubeAlertInDatabase,
    addYoutubeSeenVideos: addYoutubeSeenVideosInDatabase,
    upsertYoutubeChannelLease: upsertYoutubeChannelLeaseInDatabase,
    deleteYoutubeChannelLease: deleteYoutubeChannelLeaseInDatabase,
}

function emptySnapshot(): StoreSnapshot {
    return { watches: {}, alerts: {}, seenByWatch: {}, leases: {} }
}

function cloneWatch(entry: YoutubeWatchEntry): YoutubeWatchEntry {
    return structuredClone(entry)
}

function cloneAlert(entry: YoutubeAlertEntry): YoutubeAlertEntry {
    return structuredClone(entry)
}

function cloneLease(entry: YoutubeChannelLeaseEntry): YoutubeChannelLeaseEntry {
    return structuredClone(entry)
}

/** Test-only: replace DB adapters (pass `null` to restore defaults). */
export function setYoutubeAlertStoreDbForTests(next: Partial<YoutubeAlertStoreDb> | null): void {
    storeDb = next
        ? {
              getAllYoutubeWatchesFromDatabase:
                  next.getAllYoutubeWatchesFromDatabase ?? storeDb.getAllYoutubeWatchesFromDatabase,
              createYoutubeAlertWithWatch:
                  next.createYoutubeAlertWithWatch ?? storeDb.createYoutubeAlertWithWatch,
              updateYoutubeAlert: next.updateYoutubeAlert ?? storeDb.updateYoutubeAlert,
              deleteYoutubeAlert: next.deleteYoutubeAlert ?? storeDb.deleteYoutubeAlert,
              addYoutubeSeenVideos: next.addYoutubeSeenVideos ?? storeDb.addYoutubeSeenVideos,
              upsertYoutubeChannelLease:
                  next.upsertYoutubeChannelLease ?? storeDb.upsertYoutubeChannelLease,
              deleteYoutubeChannelLease:
                  next.deleteYoutubeChannelLease ?? storeDb.deleteYoutubeChannelLease,
          }
        : {
              getAllYoutubeWatchesFromDatabase,
              createYoutubeAlertWithWatch: createYoutubeAlertWithWatchInDatabase,
              updateYoutubeAlert: updateYoutubeAlertInDatabase,
              deleteYoutubeAlert: deleteYoutubeAlertInDatabase,
              addYoutubeSeenVideos: addYoutubeSeenVideosInDatabase,
              upsertYoutubeChannelLease: upsertYoutubeChannelLeaseInDatabase,
              deleteYoutubeChannelLease: deleteYoutubeChannelLeaseInDatabase,
          }
}

/** Test-only: clear cache, init flag, and save lock chain. */
export function resetYoutubeAlertStoreForTests(): void {
    cache = emptySnapshot()
    initialized = false
    saveChain = Promise.resolve()
}

/** Returns whether {@link initializeYoutubeAlertStore} has finished loading. */
export function isYoutubeAlertStoreInitialized(): boolean {
    return initialized
}

/** Loads Upload Watches, Alerts, seen IDs, and PubSub leases into memory. */
export async function initializeYoutubeAlertStore(
    loggerInstance?: Partial<LoggerInterface>
): Promise<void> {
    const logger = loggerFromPartial(loggerInstance)
    try {
        const loaded = await storeDb.getAllYoutubeWatchesFromDatabase()
        const next = emptySnapshot()
        for (const watch of loaded.watches) {
            next.watches[watch.id] = cloneWatch(watch)
        }
        for (const alert of loaded.alerts) {
            next.alerts[alert.id] = cloneAlert(alert)
        }
        for (const [watchId, ids] of Object.entries(loaded.seenByWatch)) {
            next.seenByWatch[Number(watchId)] = new Set(ids)
        }
        for (const lease of loaded.leases) {
            next.leases[lease.youtubeChannelId] = cloneLease(lease)
        }
        cache = next
        initialized = true
        logger.info(
            `[yt-alerts] Loaded ${Object.keys(cache.watches).length} Upload Watch(es) and ${Object.keys(cache.alerts).length} Upload Alert(s).`
        )
    } catch (error: unknown) {
        logger.error("[yt-alerts] Failed to load Upload Alerts from database:", error)
        initialized = false
        throw error
    }
}

async function withSaveLock<T>(work: () => Promise<T>): Promise<T> {
    let release: () => void = () => {}
    const previous = saveChain
    saveChain = new Promise<void>((resolve) => {
        release = resolve
    })
    await previous
    try {
        return await work()
    } finally {
        release()
    }
}

function assertInitialized(): void {
    if (!initialized) {
        throw new Error(
            "Upload Alert store accessed before initialization. Call initializeYoutubeAlertStore() first."
        )
    }
}

/** Returns a clone of one Upload Watch, or undefined. */
export function getYoutubeWatch(id: number): YoutubeWatchEntry | undefined {
    assertInitialized()
    const entry = cache.watches[id]
    return entry ? cloneWatch(entry) : undefined
}

/** Returns clones of every Upload Watch. */
export function getAllYoutubeWatches(): YoutubeWatchEntry[] {
    assertInitialized()
    return Object.values(cache.watches).map(cloneWatch)
}

/** Returns Upload Watches for one guild. */
export function getYoutubeWatchesForGuild(guildId: string): YoutubeWatchEntry[] {
    assertInitialized()
    return Object.values(cache.watches)
        .filter((watch) => watch.guildId === guildId)
        .map(cloneWatch)
}

/** Unique YouTube channel IDs across all guilds (one RSS fetch per creator). */
export function getUniqueYoutubeChannelIds(): string[] {
    assertInitialized()
    return [...new Set(Object.values(cache.watches).map((watch) => watch.youtubeChannelId))]
}

/** Watches sharing a YouTube channel (every guild that should be notified). */
export function getYoutubeWatchesForChannel(youtubeChannelId: string): YoutubeWatchEntry[] {
    assertInitialized()
    return Object.values(cache.watches)
        .filter((watch) => watch.youtubeChannelId === youtubeChannelId)
        .map(cloneWatch)
}

/** True when any other guild still has an Upload Watch for this YouTube channel. */
export function hasYoutubeWatchForChannelBesides(
    youtubeChannelId: string,
    exceptWatchId: number
): boolean {
    assertInitialized()
    return Object.values(cache.watches).some(
        (watch) => watch.youtubeChannelId === youtubeChannelId && watch.id !== exceptWatchId
    )
}

/** Returns a clone of one Upload Alert, or undefined. */
export function getYoutubeAlert(id: number): YoutubeAlertEntry | undefined {
    assertInitialized()
    const entry = cache.alerts[id]
    return entry ? cloneAlert(entry) : undefined
}

/** Returns Alerts for a Watch. */
export function getYoutubeAlertsForWatch(watchId: number): YoutubeAlertEntry[] {
    assertInitialized()
    return Object.values(cache.alerts)
        .filter((alert) => alert.watchId === watchId)
        .map(cloneAlert)
}

/** Returns Alerts in a guild, each paired with its Watch. */
export function getYoutubeAlertsForGuild(guildId: string): {
    watch: YoutubeWatchEntry
    alert: YoutubeAlertEntry
}[] {
    assertInitialized()
    const out: { watch: YoutubeWatchEntry; alert: YoutubeAlertEntry }[] = []
    for (const alert of Object.values(cache.alerts)) {
        const watch = cache.watches[alert.watchId]
        if (watch && watch.guildId === guildId) {
            out.push({ watch: cloneWatch(watch), alert: cloneAlert(alert) })
        }
    }
    return out.sort((a, b) => a.alert.id - b.alert.id)
}

/** True when this Watch has already processed the video or community post id. */
export function isYoutubeVideoSeen(watchId: number, videoId: string): boolean {
    assertInitialized()
    return cache.seenByWatch[watchId]?.has(videoId) === true
}

/** Persists and caches seen IDs for a Watch. */
export async function markYoutubeVideosSeen(watchId: number, videoIds: string[]): Promise<void> {
    assertInitialized()
    const unique = [...new Set(videoIds.map((id) => id.trim()).filter(Boolean))]
    if (unique.length === 0) return
    await withSaveLock(async () => {
        await storeDb.addYoutubeSeenVideos(watchId, unique)
        const set = cache.seenByWatch[watchId] ?? new Set<string>()
        for (const id of unique) set.add(id)
        cache.seenByWatch[watchId] = set
    })
}

/** Creates an Alert (and the Watch when this is the first Alert for that creator in the guild). */
export async function addYoutubeAlert(input: YoutubeAlertInput): Promise<{
    watch: YoutubeWatchEntry
    alert: YoutubeAlertEntry
    createdWatch: boolean
}> {
    assertInitialized()
    return withSaveLock(async () => {
        const created = await storeDb.createYoutubeAlertWithWatch(input)
        cache.watches[created.watch.id] = cloneWatch(created.watch)
        cache.alerts[created.alert.id] = cloneAlert(created.alert)
        if (created.createdWatch && !cache.seenByWatch[created.watch.id]) {
            cache.seenByWatch[created.watch.id] = new Set()
        }
        return {
            watch: cloneWatch(created.watch),
            alert: cloneAlert(created.alert),
            createdWatch: created.createdWatch,
        }
    })
}

/** Updates an Alert. Returns null when missing. */
export async function updateYoutubeAlert(
    id: number,
    patch: YoutubeAlertPatch
): Promise<YoutubeAlertEntry | null> {
    assertInitialized()
    return withSaveLock(async () => {
        const updated = await storeDb.updateYoutubeAlert(id, patch)
        if (!updated) return null
        cache.alerts[updated.id] = cloneAlert(updated)
        return cloneAlert(updated)
    })
}

/**
 * Removes an Alert. When it was the last Alert on the Watch, the Watch (and its seen IDs) go too.
 */
export async function removeYoutubeAlert(id: number): Promise<{
    alert: YoutubeAlertEntry
    removedWatch: YoutubeWatchEntry | null
} | null> {
    assertInitialized()
    return withSaveLock(async () => {
        const result = await storeDb.deleteYoutubeAlert(id)
        if (!result) return null
        delete cache.alerts[id]
        if (result.removedWatch) {
            delete cache.watches[result.removedWatch.id]
            delete cache.seenByWatch[result.removedWatch.id]
        }
        return {
            alert: cloneAlert(result.alert),
            removedWatch: result.removedWatch ? cloneWatch(result.removedWatch) : null,
        }
    })
}

/** Returns a clone of the PubSub lease, or undefined. */
export function getYoutubeChannelLease(
    youtubeChannelId: string
): YoutubeChannelLeaseEntry | undefined {
    assertInitialized()
    const entry = cache.leases[youtubeChannelId]
    return entry ? cloneLease(entry) : undefined
}

/** Channel IDs whose PubSub lease is missing or expires at or before `before`. */
export function getYoutubeChannelIdsNeedingLeaseRenew(before: Date): string[] {
    assertInitialized()
    const watched = getUniqueYoutubeChannelIds()
    return watched.filter((channelId) => {
        const lease = cache.leases[channelId]
        return !lease || lease.leaseExpiresAt.getTime() <= before.getTime()
    })
}

/** Persists and caches a PubSub lease expiry. */
export async function saveYoutubeChannelLease(
    youtubeChannelId: string,
    leaseExpiresAt: Date
): Promise<YoutubeChannelLeaseEntry> {
    assertInitialized()
    return withSaveLock(async () => {
        const saved = await storeDb.upsertYoutubeChannelLease(youtubeChannelId, leaseExpiresAt)
        cache.leases[saved.youtubeChannelId] = cloneLease(saved)
        return cloneLease(saved)
    })
}

/** Drops a PubSub lease when no guild still watches the channel. */
export async function dropYoutubeChannelLease(youtubeChannelId: string): Promise<void> {
    assertInitialized()
    await withSaveLock(async () => {
        await storeDb.deleteYoutubeChannelLease(youtubeChannelId)
        delete cache.leases[youtubeChannelId]
    })
}
