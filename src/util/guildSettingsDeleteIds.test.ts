import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { resolveGuildSettingsDeleteIds } from "./guildSettingsDeleteIds.js"

describe("resolveGuildSettingsDeleteIds", () => {
    it("skips explicit deletes when the merged row still has fields (stale deleteGuildIds)", () => {
        assert.deepEqual(
            resolveGuildSettingsDeleteIds(["g1", "g2"], [], {
                g1: { controlChannelId: "c1" },
                g2: {},
            }),
            ["g2"]
        )
    })

    it("deletes touched guilds that became empty after clearedGuildFields without deleteGuildIds", () => {
        // Regression: PR #109 removed caller-side deleteGuildIds from control-channel unset /
        // download-limit clear. Empty-after-merge guilds must still hit the DB delete path.
        assert.deepEqual(resolveGuildSettingsDeleteIds([], ["guild-only-control"], {}), [
            "guild-only-control",
        ])
    })

    it("unions explicit empty deletes with inferred empty-after-merge deletes", () => {
        assert.deepEqual(
            resolveGuildSettingsDeleteIds(["a", "b"], ["b", "c"], { a: {}, /* b absent */ }),
            ["a", "b", "c"]
        )
    })
})
