import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    GUILD_SETTING_FIELD_KEYS,
    mergeGuildSettingsRow,
    pickGuildSettingsFields,
} from "./guildSettingsMerge.js"

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

    it("touchedFields ignore stale sibling keys on a full-row RMW snapshot", () => {
        // DB after concurrent /control-channel unset (control fields cleared).
        const dbAfterUnset = {
            discordLog: { allChannelId: "log-old" },
        }
        // Stale /discord-logs snapshot still carries the pre-unset control channel ids.
        const staleFullRowSnapshot = {
            controlChannelId: "c-stale",
            controlMessageId: "m-stale",
            discordLog: { allChannelId: "log-new" },
        }
        const withoutTouch = mergeGuildSettingsRow(dbAfterUnset, staleFullRowSnapshot)
        assert.equal(withoutTouch.controlChannelId, "c-stale")
        assert.equal(withoutTouch.controlMessageId, "m-stale")

        const withTouch = mergeGuildSettingsRow(dbAfterUnset, staleFullRowSnapshot, [], [
            "discordLog",
        ])
        assert.deepEqual(withTouch, { discordLog: { allChannelId: "log-new" } })
        assert.equal("controlChannelId" in withTouch, false)
    })

    it("touchedFields + clearedFields still clear without resurrecting siblings", () => {
        const db = {
            controlChannelId: "c1",
            downloadsMaxMb: 250,
            discordLog: { allChannelId: "log1" },
        }
        const staleSnapshot = {
            controlChannelId: "c1",
            downloadsMaxMb: 250,
            discordLog: { allChannelId: "log1" },
        }
        const merged = mergeGuildSettingsRow(db, staleSnapshot, ["discordLog"], ["discordLog"])
        assert.deepEqual(merged, {
            controlChannelId: "c1",
            downloadsMaxMb: 250,
        })
    })
})

describe("pickGuildSettingsFields", () => {
    it("copies only requested defined fields", () => {
        assert.deepEqual(
            pickGuildSettingsFields(
                {
                    controlChannelId: "c1",
                    controlMessageId: "m1",
                    downloadsMaxMb: 10,
                    discordLog: { allChannelId: "d1" },
                },
                ["discordLog", "downloadsMaxMb"]
            ),
            {
                downloadsMaxMb: 10,
                discordLog: { allChannelId: "d1" },
            }
        )
    })

    it("returns {} for missing rows", () => {
        assert.deepEqual(pickGuildSettingsFields(undefined, ["controlChannelId"]), {})
    })
})
