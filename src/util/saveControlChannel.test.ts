import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import type { GuildSettingsStore } from "../types/index.js"
import {
    getGuildSettings,
    initializeGuildSettingsStore,
    isGuildSettingsInitialized,
    resetGuildSettingsStoreForTests,
    saveGuildSettings,
    setGuildSettingsStoreDbForTests,
} from "./saveControlChannel.js"

afterEach(() => {
    resetGuildSettingsStoreForTests()
    setGuildSettingsStoreDbForTests(null)
})

describe("guildSettingsStore init guard", () => {
    it("throws before initialize and after a failed load", async () => {
        assert.equal(isGuildSettingsInitialized(), false)
        assert.throws(() => getGuildSettings(), /before initialization/)

        setGuildSettingsStoreDbForTests({
            getGuildSettingsStoreFromDatabase: async () => {
                throw new Error("db down")
            },
        })
        await assert.rejects(() => initializeGuildSettingsStore({ error() {} }), /db down/)
        assert.equal(isGuildSettingsInitialized(), false)
        assert.throws(() => getGuildSettings(), /before initialization/)
    })
})

describe("guildSettingsStore clone isolation", () => {
    it("returns a deep clone so callers cannot mutate the cache", async () => {
        setGuildSettingsStoreDbForTests({
            getGuildSettingsStoreFromDatabase: async () => ({
                g1: { controlChannelId: "c1", downloadsMaxMb: 100 },
            }),
        })
        await initializeGuildSettingsStore({ debug() {} })

        const snap = getGuildSettings()
        snap.g1!.controlChannelId = "mutated"
        snap.g1!.downloadsMaxMb = 1
        delete snap.g1
        assert.equal(getGuildSettings().g1?.controlChannelId, "c1")
        assert.equal(getGuildSettings().g1?.downloadsMaxMb, 100)
    })
})

describe("guildSettingsStore touched + cleared fields + save lock", () => {
    it("merges touched/cleared fields without clobbering siblings and serializes saves", async () => {
        let dbStore: GuildSettingsStore = {
            g1: {
                controlChannelId: "c1",
                controlMessageId: "m1",
                downloadsMaxMb: 200,
            },
            g2: { downloadsMaxMb: 50 },
        }
        const replaceOrder: string[] = []
        let releaseFirst: (() => void) | undefined
        const firstGate = new Promise<void>((resolve) => {
            releaseFirst = resolve
        })
        let replaceCalls = 0

        setGuildSettingsStoreDbForTests({
            getGuildSettingsStoreFromDatabase: async () => structuredClone(dbStore),
            replaceGuildSettingsStoreInDatabase: async (store, options) => {
                replaceCalls += 1
                const callId = replaceCalls
                replaceOrder.push(`replace-${callId}-start`)
                if (callId === 1) {
                    await firstGate
                }
                dbStore = structuredClone(store)
                for (const id of options?.deleteGuildIds ?? []) {
                    delete dbStore[id]
                }
                replaceOrder.push(`replace-${callId}-end`)
                return {
                    rowsUpserted: Object.keys(store).length,
                    rowsDeleted: options?.deleteGuildIds?.length ?? 0,
                    rowsAffected:
                        Object.keys(store).length + (options?.deleteGuildIds?.length ?? 0),
                }
            },
        })
        await initializeGuildSettingsStore({ debug() {} })

        // Stale RMW snapshot still has control fields after a concurrent unset intent.
        const staleSnapshot: GuildSettingsStore = {
            g1: {
                controlChannelId: "c1",
                controlMessageId: "m1",
                downloadsMaxMb: 500,
            },
            g2: { downloadsMaxMb: 999 },
        }

        const first = saveGuildSettings(
            staleSnapshot,
            { debug() {}, error() {} },
            {
                touchedGuildIds: ["g1"],
                touchedGuildFields: { g1: ["downloadsMaxMb"] },
            }
        )
        await new Promise((r) => setImmediate(r))

        const second = saveGuildSettings(
            staleSnapshot,
            { debug() {}, error() {} },
            {
                touchedGuildIds: ["g1"],
                clearedGuildFields: { g1: ["controlChannelId", "controlMessageId"] },
                touchedGuildFields: { g1: ["controlChannelId", "controlMessageId"] },
            }
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

        const after = getGuildSettings()
        // downloadsMaxMb from first save; control fields cleared by second; g2 never touched.
        assert.equal(after.g1?.downloadsMaxMb, 500)
        assert.equal("controlChannelId" in (after.g1 ?? {}), false)
        assert.equal("controlMessageId" in (after.g1 ?? {}), false)
        assert.equal(after.g2?.downloadsMaxMb, 50)
    })

    it("deletes a guild row when clearedGuildFields empties every setting", async () => {
        let dbStore: GuildSettingsStore = {
            g1: { controlChannelId: "c1", controlMessageId: "m1" },
        }
        const deletedIds: string[] = []

        setGuildSettingsStoreDbForTests({
            getGuildSettingsStoreFromDatabase: async () => structuredClone(dbStore),
            replaceGuildSettingsStoreInDatabase: async (store, options) => {
                deletedIds.push(...(options?.deleteGuildIds ?? []))
                dbStore = structuredClone(store)
                for (const id of options?.deleteGuildIds ?? []) {
                    delete dbStore[id]
                }
                return {
                    rowsUpserted: Object.keys(store).length,
                    rowsDeleted: options?.deleteGuildIds?.length ?? 0,
                    rowsAffected:
                        Object.keys(store).length + (options?.deleteGuildIds?.length ?? 0),
                }
            },
        })
        await initializeGuildSettingsStore({ debug() {} })

        const ok = await saveGuildSettings(
            { g1: { controlChannelId: "c1", controlMessageId: "m1" } },
            { debug() {}, error() {} },
            {
                touchedGuildIds: ["g1"],
                clearedGuildFields: { g1: ["controlChannelId", "controlMessageId"] },
            }
        )
        assert.equal(ok, true)
        assert.deepEqual(deletedIds, ["g1"])
        assert.deepEqual(getGuildSettings(), {})
    })
})
