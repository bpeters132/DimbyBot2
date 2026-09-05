import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import type { GuildSettingsStore } from "../types/index.js"
import {
    getGuildSettings,
    resetGuildSettingsStoreForTests,
    saveGuildSettings,
    setGuildSettingsStoreDbForTests,
} from "./saveControlChannel.js"

afterEach(() => {
    setGuildSettingsStoreDbForTests(null)
    resetGuildSettingsStoreForTests()
})

describe("saveGuildSettings post-write reload", () => {
    it("returns true and keeps written control ids when reload fails after successful replace", async () => {
        let persisted: GuildSettingsStore = {}
        let getCalls = 0

        setGuildSettingsStoreDbForTests({
            getGuildSettingsStoreFromDatabase: async () => {
                getCalls += 1
                // First call: pre-write merge base. Second call: post-write reload.
                if (getCalls === 1) {
                    return {}
                }
                throw new Error("simulated post-write reload failure")
            },
            replaceGuildSettingsStoreInDatabase: async (store) => {
                persisted = structuredClone(store)
                return { rowsUpserted: 1, rowsDeleted: 0, rowsAffected: 1 }
            },
        })

        const ok = await saveGuildSettings(
            {
                "guild-1": {
                    controlChannelId: "channel-1",
                    controlMessageId: "message-1",
                },
            },
            undefined,
            {
                touchedGuildIds: ["guild-1"],
                touchedGuildFields: {
                    "guild-1": ["controlChannelId", "controlMessageId"],
                },
            }
        )

        assert.equal(ok, true)
        assert.equal(persisted["guild-1"]?.controlChannelId, "channel-1")
        assert.equal(persisted["guild-1"]?.controlMessageId, "message-1")
        assert.equal(getGuildSettings()["guild-1"]?.controlChannelId, "channel-1")
        assert.equal(getGuildSettings()["guild-1"]?.controlMessageId, "message-1")
    })

    it("returns false when the replace write itself fails", async () => {
        setGuildSettingsStoreDbForTests({
            getGuildSettingsStoreFromDatabase: async () => ({}),
            replaceGuildSettingsStoreInDatabase: async () => {
                throw new Error("simulated write failure")
            },
        })

        const ok = await saveGuildSettings(
            {
                "guild-1": {
                    controlChannelId: "channel-1",
                    controlMessageId: "message-1",
                },
            },
            undefined,
            {
                touchedGuildIds: ["guild-1"],
                touchedGuildFields: {
                    "guild-1": ["controlChannelId", "controlMessageId"],
                },
            }
        )

        assert.equal(ok, false)
        assert.throws(() => getGuildSettings())
    })
})
