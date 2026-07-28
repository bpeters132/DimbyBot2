import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { GUILD_SETTING_FIELD_KEYS, mergeGuildSettingsRow } from "./guildSettingsMerge.js"

describe("mergeGuildSettingsRow", () => {
    it("keeps DB fields omitted from the snapshot (no cross-field clobber)", () => {
        const merged = mergeGuildSettingsRow(
            {
                controlChannelId: "c1",
                controlMessageId: "m1",
                downloadsMaxMb: 500,
            },
            { controlChannelId: "c2" }
        )
        assert.deepEqual(merged, {
            controlChannelId: "c2",
            controlMessageId: "m1",
            downloadsMaxMb: 500,
        })
    })

    it("applies clearedFields even when the snapshot still lists those keys", () => {
        const merged = mergeGuildSettingsRow(
            { controlChannelId: "c1", downloadsMaxMb: 200 },
            { controlChannelId: "c1", downloadsMaxMb: 200 },
            ["downloadsMaxMb"]
        )
        assert.deepEqual(merged, { controlChannelId: "c1" })
        assert.equal("downloadsMaxMb" in merged, false)
    })

    it("builds a row from snapshot alone when the DB row is missing", () => {
        const merged = mergeGuildSettingsRow(undefined, {
            discordLog: { allChannelId: "log1" },
            downloadsMaxMb: 100,
        })
        assert.deepEqual(merged, {
            discordLog: { allChannelId: "log1" },
            downloadsMaxMb: 100,
        })
    })

    it("ignores undefined snapshot values and unknown cleared keys leave other fields", () => {
        const merged = mergeGuildSettingsRow(
            { controlChannelId: "c1", controlMessageId: "m1" },
            { controlChannelId: undefined as unknown as string, controlMessageId: "m2" },
            []
        )
        assert.deepEqual(merged, { controlChannelId: "c1", controlMessageId: "m2" })
    })

    it("returns an empty object when clearing every known field", () => {
        const merged = mergeGuildSettingsRow(
            {
                controlChannelId: "c1",
                controlMessageId: "m1",
                downloadsMaxMb: 50,
                discordLog: { allChannelId: "d1" },
            },
            {},
            [...GUILD_SETTING_FIELD_KEYS]
        )
        assert.deepEqual(merged, {})
    })

    it("does not mutate the input DB row", () => {
        const db = { controlChannelId: "c1", downloadsMaxMb: 10 }
        const merged = mergeGuildSettingsRow(db, { downloadsMaxMb: 20 })
        assert.equal(db.downloadsMaxMb, 10)
        assert.equal(merged.downloadsMaxMb, 20)
        assert.notEqual(merged, db)
    })
})
