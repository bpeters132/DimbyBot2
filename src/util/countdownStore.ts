import type {
    CountdownEntry,
    CountdownInput,
    CountdownStore,
    LoggerInterface,
} from "../types/index.js"
import {
    createCountdown as createCountdownInDatabase,
    deleteCountdown as deleteCountdownInDatabase,
    getAllCountdownsFromDatabase,
} from "../repositories/countdownRepository.js"
import { loggerFromPartial } from "./loggerFromPartial.js"

/** In-memory countdown cache loaded from the database at startup. */
let countdownCache: CountdownStore = {}
let initialized = false
let saveCountdownChain: Promise<void> = Promise.resolve()

/**
 * Deep-clones the countdown store. `structuredClone` is required here (not the JSON fallback)
 * because entries carry `Date` fields that JSON round-tripping would corrupt; Node 24+ always
 * provides `structuredClone` (see repo `engines`).
 */
function cloneStore(store: CountdownStore): CountdownStore {
    return structuredClone(store)
}

function cloneEntry(entry: CountdownEntry): CountdownEntry {
    return structuredClone(entry)
}

/** Returns whether {@link initializeCountdownStore} has finished loading from the database. */
export function isCountdownStoreInitialized(): boolean {
    return initialized
}

/** Loads all countdowns from the database into the in-memory cache. */
export async function initializeCountdownStore(
    loggerInstance?: Partial<LoggerInterface>
): Promise<void> {
    const logger = loggerFromPartial(loggerInstance)
    try {
        const loaded = await getAllCountdownsFromDatabase()
        countdownCache = cloneStore(loaded)
        initialized = true
        logger.info(
            `[countdown] Loaded ${Object.keys(countdownCache).length} countdown(s) from database.`
        )
    } catch (error: unknown) {
        logger.error("[countdown] Failed to load countdowns from database:", error)
        initialized = false
        throw error
    }
}

async function withCountdownSaveLock<T>(work: () => Promise<T>): Promise<T> {
    let release: () => void = () => {}
    const previous = saveCountdownChain
    saveCountdownChain = new Promise<void>((resolve) => {
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
            "Countdown store accessed before initialization. Call initializeCountdownStore() first."
        )
    }
}

/** Returns a clone of a single countdown, or undefined if not found. */
export function getCountdown(id: number): CountdownEntry | undefined {
    assertInitialized()
    const entry = countdownCache[id]
    return entry ? cloneEntry(entry) : undefined
}

/** Returns a clone of all countdowns keyed by id. */
export function getAllCountdowns(): CountdownStore {
    assertInitialized()
    return cloneStore(countdownCache)
}

/** Returns clones of all countdowns belonging to a guild. */
export function getCountdownsForGuild(guildId: string): CountdownEntry[] {
    assertInitialized()
    return Object.values(countdownCache)
        .filter((entry) => entry.guildId === guildId)
        .map(cloneEntry)
}

/** Persists a new countdown to the database and adds it to the cache. Returns the created entry. */
export async function addCountdown(input: CountdownInput): Promise<CountdownEntry> {
    assertInitialized()
    return withCountdownSaveLock(async () => {
        const created = await createCountdownInDatabase(input)
        countdownCache[created.id] = cloneEntry(created)
        return cloneEntry(created)
    })
}

/** Removes a countdown from the database and the cache. */
export async function removeCountdown(id: number): Promise<void> {
    assertInitialized()
    await withCountdownSaveLock(async () => {
        await deleteCountdownInDatabase(id)
        delete countdownCache[id]
    })
}
