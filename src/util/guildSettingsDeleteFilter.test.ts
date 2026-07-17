import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { guildIdsEligibleForSettingsDelete } from "./guildSettingsDeleteFilter.js"

describe("guildIdsEligibleForSettingsDelete", () => {
    it("skips guilds that still have settings after merge (stale deleteGuildIds regression)", () => {
        const eligible = guildIdsEligibleForSettingsDelete(["g1", "g2", "g3"], {
            g1: { controlChannelId: "c1" },
            g2: {},
        })
        assert.deepEqual(eligible.sort(), ["g2", "g3"])
    })

    it("allows delete when the merged row is empty or absent", () => {
        assert.deepEqual(guildIdsEligibleForSettingsDelete(["missing"], {}), ["missing"])
        assert.deepEqual(guildIdsEligibleForSettingsDelete(["empty"], { empty: {} }), ["empty"])
    })

    it("returns empty when every candidate still has fields", () => {
        assert.deepEqual(
            guildIdsEligibleForSettingsDelete(["a"], { a: { controlMessageId: "m1" } }),
            []
        )
    })
})
