import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import type { DownloadsMetadataStore, ReplaceDownloadMetadataStoreResult } from "../types/index.js"
import { downloadMetadataStoreKey } from "./downloadMetadataKeys.js"
import {
    getDownloadMetadataStore,
    initializeDownloadMetadataStore,
    isDownloadMetadataStoreInitialized,
    resetDownloadMetadataStoreForTests,
    saveDownloadMetadataStore,
    setDownloadMetadataStoreDbForTests,
} from "./downloadMetadataStore.js"

const guildId = "guild-1"
const keepKey = downloadMetadataStoreKey(guildId, "keep.wav")
const otherKey = downloadMetadataStoreKey(guildId, "other.wav")
const dropKey = downloadMetadataStoreKey(guildId, "drop.wav")

function okReplace(
    overrides: Partial<ReplaceDownloadMetadataStoreResult> = {}
): ReplaceDownloadMetadataStoreResult {
    return { rowsWritten: 1, rowsDeleted: 0, skippedEntries: [], ...overrides }
}

afterEach(() => {
    resetDownloadMetadataStoreForTests()
    setDownloadMetadataStoreDbForTests(null)
})

describe("downloadMetadataStore init guard", () => {
    it("throws before initialize and after a failed load", async () => {
        assert.equal(isDownloadMetadataStoreInitialized(), false)
        assert.throws(() => getDownloadMetadataStore(), /not initialized/)

        setDownloadMetadataStoreDbForTests({
            getDownloadMetadataStoreFromDatabase: async () => {
                throw new Error("db down")
            },
        })
        await assert.rejects(() => initializeDownloadMetadataStore({ error() {} }), /db down/)
        assert.equal(isDownloadMetadataStoreInitialized(), false)
        assert.throws(() => getDownloadMetadataStore(), /not initialized/)
    })
})

describe("downloadMetadataStore clone isolation", () => {
    it("returns a deep clone so callers cannot mutate the cache", async () => {
        setDownloadMetadataStoreDbForTests({
            getDownloadMetadataStoreFromDatabase: async () => ({
                [keepKey]: { guildId, originalUrl: "https://keep" },
            }),
        })
        await initializeDownloadMetadataStore({ info() {} })

        const snap = getDownloadMetadataStore()
        snap[keepKey]!.originalUrl = "https://mutated"
        delete snap[keepKey]
        assert.equal(getDownloadMetadataStore()[keepKey]?.originalUrl, "https://keep")
    })
})

describe("downloadMetadataStore touched keys + save lock", () => {
    it("applies only touchedStoreKeys and serializes concurrent saves", async () => {
        let dbStore: DownloadsMetadataStore = {
            [keepKey]: { guildId, originalUrl: "https://keep-db" },
            [otherKey]: { guildId, originalUrl: "https://other-db" },
        }
        const replaceOrder: string[] = []
        let releaseFirst: (() => void) | undefined
        const firstGate = new Promise<void>((resolve) => {
            releaseFirst = resolve
        })
        let replaceCalls = 0

        setDownloadMetadataStoreDbForTests({
            getDownloadMetadataStoreFromDatabase: async () => structuredClone(dbStore),
            replaceDownloadMetadataStoreInDatabase: async (store, options) => {
                replaceCalls += 1
                const callId = replaceCalls
                replaceOrder.push(`replace-${callId}-start`)
                if (callId === 1) {
                    await firstGate
                }
                dbStore = structuredClone(store)
                for (const key of options?.deleteStoreKeys ?? []) {
                    delete dbStore[key]
                }
                replaceOrder.push(`replace-${callId}-end`)
                return okReplace({
                    rowsWritten: Object.keys(store).length,
                    rowsDeleted: options?.deleteStoreKeys?.length ?? 0,
                })
            },
        })
        await initializeDownloadMetadataStore({ info() {} })

        // Stale full-map snapshot still lists otherKey with an outdated URL.
        const staleSnapshot: DownloadsMetadataStore = {
            [keepKey]: { guildId, originalUrl: "https://keep-new" },
            [otherKey]: { guildId, originalUrl: "https://other-stale" },
        }
        const first = saveDownloadMetadataStore(
            staleSnapshot,
            { debug() {}, warn() {} },
            {
                touchedStoreKeys: [keepKey],
            }
        )
        await new Promise((r) => setImmediate(r))

        const second = saveDownloadMetadataStore(
            { [dropKey]: { guildId, originalUrl: "https://drop" }, ...staleSnapshot },
            { debug() {}, warn() {} },
            { deleteStoreKeys: [dropKey], touchedStoreKeys: [] }
        )

        releaseFirst!()
        assert.equal(await first, true)
        assert.equal(await second, true)

        assert.deepEqual(replaceOrder, [
            "replace-1-start",
            "replace-1-end",
            "replace-2-start",
            "replace-2-end",
        ])
        // Touched save updated keepKey; concurrent empty-touched delete pass did not clobber otherKey.
        assert.equal(getDownloadMetadataStore()[keepKey]?.originalUrl, "https://keep-new")
        assert.equal(getDownloadMetadataStore()[otherKey]?.originalUrl, "https://other-db")
        assert.equal(dropKey in getDownloadMetadataStore(), false)
    })

    it("falls back to merged snapshot when cache reload fails after replace", async () => {
        let getCalls = 0
        setDownloadMetadataStoreDbForTests({
            getDownloadMetadataStoreFromDatabase: async () => {
                getCalls += 1
                if (getCalls === 1) {
                    return { [keepKey]: { guildId, originalUrl: "https://old" } }
                }
                if (getCalls === 2) {
                    // Mid-save read of DB before replace
                    return { [keepKey]: { guildId, originalUrl: "https://old" } }
                }
                throw new Error("reload failed")
            },
            replaceDownloadMetadataStoreInDatabase: async () =>
                okReplace({
                    skippedEntries: [
                        {
                            key: dropKey,
                            reason: "unresolvable-guild-id",
                            fileName: "drop.wav",
                        },
                    ],
                }),
        })
        await initializeDownloadMetadataStore({ info() {} })

        const ok = await saveDownloadMetadataStore(
            {
                [keepKey]: { guildId, originalUrl: "https://new" },
                [dropKey]: { guildId: "", originalUrl: "https://skip" },
            },
            { debug() {}, warn() {} }
        )
        assert.equal(ok, false)
        assert.equal(getDownloadMetadataStore()[keepKey]?.originalUrl, "https://new")
        assert.equal(dropKey in getDownloadMetadataStore(), false)
        assert.equal(isDownloadMetadataStoreInitialized(), true)
    })
})
